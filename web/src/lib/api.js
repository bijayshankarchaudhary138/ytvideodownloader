/**
 * Thin API client. Every URL is relative, so the app works behind any host or
 * reverse proxy (and no environment-specific base URL can leak into the build).
 */
export function apiUrl(pathname) {
  return pathname;
}

class ApiError extends Error {
  constructor(payload, status) {
    const code = payload?.error?.code ?? 'UNKNOWN';
    super(payload?.error?.message ?? `Request failed (${status})`);
    this.code = code;
    this.status = status;
    this.details = payload?.error?.details ?? null;
  }
}

async function request(pathname, { method = 'GET', body, signal, headers = {} } = {}) {
  let res;
  try {
    res = await fetch(apiUrl(pathname), {
      method,
      headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (err) {
    const offline = new ApiError({ error: { code: 'NETWORK', message: 'Network error — check your connection.' } }, 0);
    offline.cause = err;
    throw offline;
  }

  if (res.status === 204) return null;
  const text = await res.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = null; }
  if (!res.ok) throw new ApiError(payload, res.status);
  return payload;
}

export { ApiError };

export const getMeta = () => request('/api/meta');
export const getHealth = () => request('/api/health');
export const getInfo = (url, { refresh = false } = {}) => request('/api/info', { method: 'POST', body: { url, refresh } });
export const createJob = (payload) => request('/api/jobs', { method: 'POST', body: payload });
export const listJobs = (params = {}) => {
  const query = new URLSearchParams(params).toString();
  return request(`/api/jobs${query ? `?${query}` : ''}`);
};
export const getJob = (id) => request(`/api/jobs/${id}`);
export const getJobStatus = (id) => request(`/api/jobs/${id}/status`);
export const cancelJob = (id) => request(`/api/jobs/${id}/cancel`, { method: 'POST' });
export const retryJob = (id) => request(`/api/jobs/${id}/retry`, { method: 'POST' });
export const deleteJob = (id) => request(`/api/jobs/${id}`, { method: 'DELETE' });
export const createBatch = (payload) => request('/api/batch', { method: 'POST', body: payload });
export const getBatch = (id) => request(`/api/batch/${id}`);
export const openApi = () => request('/api/openapi.json');

/**
 * Live updates with a belt-and-braces safety net.
 *
 * SSE gives instant progress, but a proxy that buffers or breaks
 * `text/event-stream` leaves the connection open with no events forever — the
 * classic "I clicked Download and nothing happens" bug. So we ALSO poll: fast
 * while a job is active (or while SSE looks dead), slowly otherwise. The two
 * sources are merged through a status map so callers never see duplicates.
 */
export function subscribeEvents(handlers = {}, options = {}) {
  const { onUpdate, onProgress, onDone, onError } = handlers;
  const {
    hasActiveJobs = () => true,
    activePollMs = 1500,
    idlePollMs = 8000,
    backupPollMs = 15_000,
    sseStaleMs = 12_000,
  } = options;

  const seen = new Map(); // job id → last status we reported

  const report = (job) => {
    if (!job?.id || !job.status) return;
    const previous = seen.get(job.id);
    seen.set(job.id, job.status);
    const terminal = ['ready', 'failed', 'canceled', 'expired'].includes(job.status);
    if (terminal && previous !== job.status) onDone?.(job);
    else onUpdate?.(job);
  };

  let stopped = false;
  let timer = null;
  let source = null;
  let lastSseAt = 0;
  let sseOpened = false;

  const sseFresh = () => sseOpened && Date.now() - lastSseAt < sseStaleMs;

  const nextDelay = () => {
    if (typeof document !== 'undefined' && document.hidden) return backupPollMs;
    const active = hasActiveJobs();
    if (!EventSourceCtor) return active ? activePollMs : idlePollMs; // no SSE at all
    if (!sseFresh()) return active ? activePollMs : idlePollMs;      // SSE silent/dead
    return active ? idlePollMs : backupPollMs;                       // SSE healthy → thin safety net
  };

  const poll = async () => {
    if (stopped) return;
    try {
      const { jobs } = await listJobs({ limit: 50 });
      for (const job of jobs ?? []) report(job);
    } catch (err) {
      onError?.(err);
    }
    if (!stopped) timer = setTimeout(poll, nextDelay());
  };

  const EventSourceCtor = typeof window !== 'undefined' ? (window.EventSource ?? window.EventSourcePolyfill) : undefined;
  if (EventSourceCtor) {
    try {
      source = new EventSourceCtor(apiUrl('/api/events'));
      const touch = () => { lastSseAt = Date.now(); sseOpened = true; };
      const parse = (event) => { try { return JSON.parse(event.data); } catch { return null; } };
      source.addEventListener('open', touch);
      source.addEventListener('hello', touch);
      source.addEventListener('ping', touch);
      source.addEventListener('job:update', (e) => { touch(); const d = parse(e); if (d?.job) report(d.job); });
      source.addEventListener('job:progress', (e) => {
        touch();
        const d = parse(e);
        if (d?.job) report(d.job);
        else if (d?.id) onProgress?.(d);
      });
      source.addEventListener('job:done', (e) => { touch(); const d = parse(e); if (d?.job) report(d.job); });
      source.addEventListener('error', () => { sseOpened = false; });
    } catch {
      source = null;
    }
  }

  // Poll immediately once, then keep the safety net running for the whole session.
  poll();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    try { source?.close?.(); } catch { /* ignore */ }
  };
}

export function downloadUrl(job) {
  return job?.fileUrl ? apiUrl(job.fileUrl) : null;
}
