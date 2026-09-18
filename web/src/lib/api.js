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
 * Live updates. Uses Server-Sent Events when the browser supports it and falls
 * back to polling otherwise, so progress always works.
 */
export function subscribeEvents(handlers = {}) {
  const { onUpdate, onProgress, onDone, onError } = handlers;
  const EventSourceCtor = typeof window !== 'undefined' ? (window.EventSource ?? window.EventSourcePolyfill) : undefined;

  const parse = (event) => {
    try { return JSON.parse(event.data); } catch { return null; }
  };

  if (EventSourceCtor) {
    let source;
    try {
      source = new EventSourceCtor(apiUrl('/api/events'));
    } catch {
      source = null;
    }
    if (source) {
      source.addEventListener('job:update', (e) => { const d = parse(e); if (d?.job) onUpdate?.(d.job); });
      source.addEventListener('job:progress', (e) => { const d = parse(e); if (d) onProgress?.(d); });
      source.addEventListener('job:done', (e) => { const d = parse(e); if (d?.job) onDone?.(d.job); });
      source.addEventListener('error', (err) => onError?.(err));
      return () => { try { source.close(); } catch { /* ignore */ } };
    }
  }

  let stopped = false;
  let timer = null;
  const poll = async () => {
    if (stopped) return;
    try {
      const { jobs } = await listJobs({ limit: 50 });
      for (const job of jobs ?? []) {
        if (job.status === 'ready' || job.status === 'failed' || job.status === 'canceled' || job.status === 'expired') onDone?.(job);
        else onUpdate?.(job);
      }
    } catch (err) {
      onError?.(err);
    }
    if (!stopped) timer = setTimeout(poll, 2000);
  };
  poll();
  return () => { stopped = true; if (timer) clearTimeout(timer); };
}

export function downloadUrl(job) {
  return job?.fileUrl ? apiUrl(job.fileUrl) : null;
}
