/**
 * In-memory job queue with a tiny state machine:
 *   queued → downloading → processing(merging/converting/finalizing) → ready
 *          ↘ failed / canceled / expired
 *
 * Jobs are deliberately *not* persisted: files live on disk with a TTL, and a
 * restart should not resurrect half-finished downloads.
 */
import fs from 'node:fs';
import { shortId, sleep } from './util.js';

const CTRL = Symbol('abortController');
const TERMINAL = new Set(['ready', 'failed', 'canceled', 'expired']);

export function createJobStore({
  runner,
  concurrency = 2,
  ttlMs = 6 * 3600_000,
  maxQueueLength = Number.POSITIVE_INFINITY,
  logger = { warn() {}, error() {}, info() {}, debug() {} },
  onExpire = null,
} = {}) {
  if (typeof runner !== 'function') throw new Error('createJobStore requires a runner function');

  const jobs = new Map();
  const queue = [];
  const listeners = new Set();
  let active = 0;
  let shuttingDown = false;

  /* ---------------- events ---------------- */
  function subscribe(fn) {
    if (typeof fn !== 'function') return () => {};
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function emit(event) {
    for (const fn of listeners) {
      try { fn(event); } catch (err) { logger.warn?.('listener failed:', err?.message ?? err); }
    }
  }

  /* ---------------- public projection ---------------- */
  function publicJob(job) {
    if (!job) return null;
    return {
      id: job.id,
      status: job.status,
      url: job.url,
      preset: job.preset,
      kind: job.kind,
      title: job.title ?? null,
      subtitle: job.subtitle ?? null,
      trim: job.trim ?? null,
      attempts: job.attempts ?? 0,
      engine: job.engine ?? null,
      createdAt: job.createdAt,
      startedAt: job.startedAt ?? null,
      finishedAt: job.finishedAt ?? null,
      expiresAt: job.expiresAt,
      progress: { ...job.progress },
      filename: job.filename ?? null,
      fileUrl: job.fileUrl ?? null,
      size: job.size ?? null,
      mimeType: job.mimeType ?? null,
      needsMux: Boolean(job.needsMux),
      height: job.height ?? null,
      width: job.width ?? null,
      quality: job.quality ?? null,
      qualityFallback: job.qualityFallback ?? null,
      duration: job.duration ?? null,
      error: job.error ?? null,
      logs: job.logs ? job.logs.slice(-20) : undefined,
    };
  }

  /* ---------------- core ---------------- */
  function create(input = {}) {
    if (shuttingDown) {
      const err = new Error('server is shutting down');
      err.code = 'SERVER_SHUTDOWN';
      throw err;
    }
    if (queue.length >= maxQueueLength) {
      const err = new Error('queue is full');
      err.code = 'QUEUE_FULL';
      throw err;
    }
    const now = Date.now();
    const job = {
      id: shortId(),
      status: 'queued',
      url: input.url,
      preset: input.preset,
      kind: input.kind ?? 'video',
      title: input.title ?? null,
      subtitle: input.subtitle ?? null,
      trim: input.trim ?? null,
      attempts: 0,
      engine: input.engine ?? null,
      createdAt: now,
      startedAt: null,
      finishedAt: null,
      expiresAt: now + ttlMs,
      progress: { stage: 'queued', percent: 0, speed: null, eta: null, downloaded: null, total: null },
      filename: null,
      fileUrl: null,
      filePath: null,
      error: null,
      needsMux: false,
      [CTRL]: new AbortController(),
    };
    jobs.set(job.id, job);
    queue.push(job.id);
    emit({ type: 'job:update', job: publicJob(job) });
    queueMicrotask(pump);
    return publicJob(job);
  }

  function get(id) {
    return publicJob(jobs.get(String(id)));
  }

  /** Internal (non-projected) access for services. */
  function peek(id) {
    return jobs.get(String(id)) ?? null;
  }

  function list({ status = null, limit = 100, offset = 0 } = {}) {
    let all = [...jobs.values()].sort((a, b) => b.createdAt - a.createdAt);
    if (status) {
      const wanted = Array.isArray(status) ? status : [status];
      all = all.filter((j) => wanted.includes(j.status));
    }
    return all.slice(offset, offset + limit).map(publicJob);
  }

  function update(id, patch = {}) {
    const job = jobs.get(String(id));
    if (!job) return null;
    const prevStatus = job.status;
    if (patch.status) job.status = patch.status;
    for (const [key, value] of Object.entries(patch)) {
      if (key === 'progress' || key === 'status') continue;
      job[key] = value;
    }
    if (patch.progress) job.progress = { ...job.progress, ...patch.progress };
    job.updatedAt = Date.now();

    const pub = publicJob(job);
    emit({ type: 'job:update', job: pub });

    if (job.status === 'ready' && prevStatus !== 'ready') {
      job.finishedAt = job.finishedAt ?? Date.now();
      job.expiresAt = Date.now() + ttlMs;
      emit({ type: 'job:done', job: publicJob(job) });
    }
    if (job.status === 'failed' && prevStatus !== 'failed') {
      job.finishedAt = Date.now();
      job.expiresAt = Date.now() + ttlMs;
      emit({ type: 'job:done', job: publicJob(job) });
    }
    return pub;
  }

  function progress(id, patch = {}) {
    const job = jobs.get(String(id));
    if (!job) return null;
    job.progress = { ...job.progress, ...patch };
    if (patch.percent !== undefined && patch.percent !== null) {
      job.progress.percent = Math.max(0, Math.min(100, Number(patch.percent) || 0));
    }
    job.updatedAt = Date.now();
    emit({ type: 'job:progress', id: job.id, job: publicJob(job), progress: { ...job.progress } });
    return publicJob(job);
  }

  /* ---------------- queue ---------------- */
  function pump() {
    while (!shuttingDown && active < concurrency && queue.length > 0) {
      const id = queue.shift();
      const job = jobs.get(id);
      if (!job || job.status !== 'queued') continue;
      runJob(job);
    }
  }

  function runJob(job) {
    active++;
    job.startedAt = Date.now();
    if (!job[CTRL] || job[CTRL].signal.aborted) job[CTRL] = new AbortController();
    const signal = job[CTRL].signal;
    // Move out of the queue immediately so the UI never shows "queued" for a
    // job that is already running (runners may refine the stage further).
    update(job.id, { status: 'downloading', progress: { stage: 'downloading' } });
    const ctx = {
      jobId: job.id,
      signal,
      log: (line) => {
        job.logs = job.logs ?? [];
        job.logs.push(String(line).slice(0, 400));
      },
      update: (patch) => update(job.id, patch),
      progress: (patch) => progress(job.id, patch),
      wait: (ms) => new Promise((resolve, reject) => {
        if (signal.aborted) {
          reject(Object.assign(new Error('aborted'), { code: 'ABORTED' }));
          return;
        }
        const timer = setTimeout(() => {
          signal.removeEventListener('abort', onAbort);
          resolve();
        }, ms);
        function onAbort() {
          clearTimeout(timer);
          reject(Object.assign(new Error('aborted'), { code: 'ABORTED' }));
        }
        signal.addEventListener('abort', onAbort, { once: true });
      }),
    };

    Promise.resolve()
      .then(() => runner(publicJob(job), ctx))
      .catch((err) => {
        if (signal.aborted || job.status === 'canceled') {
          if (job.status !== 'canceled') update(job.id, { status: 'canceled', error: null });
          return;
        }
        const code = typeof err?.code === 'string' && /^[A-Z_]+$/.test(err.code) ? err.code : 'DOWNLOAD_FAILED';
        const message = String(err?.message ?? 'download failed').slice(0, 300);
        logger.warn?.(`job ${job.id} failed: ${code} ${message}`);
        update(job.id, { status: 'failed', error: { code, message } });
      })
      .finally(() => {
        active = Math.max(0, active - 1);
        if (!TERMINAL.has(job.status)) {
          // a runner that simply returned without setting a status
          update(job.id, { status: 'failed', error: { code: 'DOWNLOAD_FAILED', message: 'job ended unexpectedly' } });
        }
        pump();
      });
  }

  function cancel(id) {
    const job = jobs.get(String(id));
    if (!job) return false;
    if (TERMINAL.has(job.status)) return false;
    const idx = queue.indexOf(job.id);
    if (idx >= 0) queue.splice(idx, 1);
    try { job[CTRL]?.abort(); } catch { /* ignore */ }
    update(job.id, { status: 'canceled', error: null, progress: { stage: 'canceled' } });
    return true;
  }

  function retry(id) {
    const job = jobs.get(String(id));
    if (!job) return null;
    if (job.status === 'queued' || job.status === 'downloading' || job.status === 'processing') return publicJob(job);
    job[CTRL] = new AbortController();
    job.attempts = (job.attempts ?? 0) + 1;
    job.error = null;
    job.filePath = null;
    job.fileUrl = null;
    update(job.id, {
      status: 'queued',
      filename: null,
      size: null,
      finishedAt: null,
      progress: { stage: 'queued', percent: 0, speed: null, eta: null, downloaded: null, total: null },
    });
    queue.push(job.id);
    queueMicrotask(pump);
    return publicJob(job);
  }

  function remove(id) {
    const job = jobs.get(String(id));
    if (!job) return false;
    const idx = queue.indexOf(job.id);
    if (idx >= 0) queue.splice(idx, 1);
    try { job[CTRL]?.abort(); } catch { /* ignore */ }
    cleanupFile(job);
    jobs.delete(job.id);
    return true;
  }

  function stats() {
    const counts = { total: jobs.size, queued: 0, downloading: 0, processing: 0, ready: 0, failed: 0, canceled: 0, expired: 0 };
    for (const job of jobs.values()) {
      if (counts[job.status] !== undefined) counts[job.status]++;
      else counts.queued++;
    }
    return { ...counts, active, queueLength: queue.length, concurrency };
  }

  function cleanupFile(job) {
    if (!job?.filePath) return;
    try { fs.rmSync(job.filePath, { force: true }); } catch { /* ignore */ }
  }

  /** Expire finished jobs whose TTL has passed; returns how many were expired. */
  function sweepExpired(now = Date.now()) {
    let expired = 0;
    for (const job of jobs.values()) {
      const finished = job.expiresAt && job.expiresAt <= now;
      if (!finished) continue;
      if (job.status === 'ready' || job.status === 'failed' || job.status === 'canceled') {
        cleanupFile(job);
        job.status = 'expired';
        job.progress = { ...job.progress, stage: 'expired' };
        emit({ type: 'job:update', job: publicJob(job) });
        expired++;
        try { onExpire?.(publicJob(job)); } catch { /* ignore */ }
      } else if (job.status === 'queued' || job.status === 'downloading' || job.status === 'processing') {
        // a job that has been running way past its TTL is stuck
        if (job.startedAt && now - job.startedAt > Math.max(ttlMs, 60_000)) {
          try { job[CTRL]?.abort(); } catch { /* ignore */ }
          update(job.id, { status: 'failed', error: { code: 'TIMEOUT', message: 'download timed out' } });
        }
      }
    }
    return expired;
  }

  function shutdown() {
    shuttingDown = true;
    queue.length = 0;
    for (const job of jobs.values()) {
      try { job[CTRL]?.abort(); } catch { /* ignore */ }
    }
  }

  return {
    create, get, peek, list, update, progress, cancel, retry, remove,
    stats, subscribe, sweepExpired, shutdown,
    /** test/debug helper */
    waitForTerminal: async (id, timeoutMs = 60_000) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const job = jobs.get(String(id));
        if (job && TERMINAL.has(job.status)) return publicJob(job);
        await sleep(50);
      }
      return get(id);
    },
  };
}
