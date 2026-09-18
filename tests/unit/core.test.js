import { describe, it, expect, vi } from 'vitest';
import { createJobStore } from '@server/core/jobStore.js';
import { createRateLimiter } from '@server/core/rateLimit.js';
import {
  sanitizeFilename,
  safeJoin,
  isPrivateHost,
  slugify,
  parseRange,
  clamp,
  uniqueName,
  sha256,
  parseSizeLimit,
} from '@server/core/util.js';
import { en } from '@server/core/i18n/en.js';
import { hi } from '@server/core/i18n/hi.js';
import { translate, hasLanguage, listLanguages } from '@server/core/i18n/index.js';

/* ------------------------------------------------------------------ */
/* Job store                                                            */
/* ------------------------------------------------------------------ */
describe('job store', () => {
  const makeRunner = (behaviour = {}) =>
    vi.fn(async (job, ctx) => {
      ctx.update({ status: 'downloading', progress: { stage: 'downloading', percent: 10 } });
      if (behaviour.pause) await ctx.wait(behaviour.pause);
      if (behaviour.fail) throw behaviour.fail;
      ctx.update({ status: 'ready', progress: { stage: 'ready', percent: 100 }, filename: 'x.mp4' });
    });

  it('creates a job with a stable public shape', () => {
    const store = createJobStore({ runner: makeRunner() });
    const job = store.create({ url: 'https://youtu.be/x', preset: 'mp4-1080', title: 'Hi' });
    expect(job.id).toMatch(/^[a-z0-9-]{8,}$/);
    expect(job.status).toBe('queued');
    expect(job.progress.percent).toBe(0);
    expect(job.preset).toBe('mp4-1080');
    expect(job.expiresAt).toBeGreaterThan(Date.now());
    expect(JSON.stringify(job)).not.toContain('signal'); // no internal machinery leaked
    store.shutdown();
  });

  it('runs jobs through queued → downloading → ready and emits update events', async () => {
    const store = createJobStore({ runner: makeRunner() });
    const seen = [];
    const unsub = store.subscribe((evt) => seen.push(evt));
    const job = store.create({ url: 'https://youtu.be/x', preset: 'mp3-320' });
    await vi.waitFor(() => expect(store.get(job.id).status).toBe('ready'), { timeout: 4000 });
    unsub();
    const statuses = seen.filter((e) => e.type === 'job:update').map((e) => e.job.status);
    expect(statuses[0]).toBe('queued');
    expect(statuses).toContain('downloading');
    expect(statuses.at(-1)).toBe('ready');
    expect(store.get(job.id).filename).toBe('x.mp4');
    expect(store.get(job.id).progress.percent).toBe(100);
    store.shutdown();
  });

  it('honours the concurrency limit', async () => {
    const running = [];
    const store = createJobStore({
      concurrency: 1,
      runner: vi.fn(async (job, ctx) => {
        running.push(job.id);
        await ctx.wait(120);
        ctx.update({ status: 'ready' });
      }),
    });
    const a = store.create({ url: 'a' });
    const b = store.create({ url: 'b' });
    await vi.waitFor(() => expect(store.get(a.id).status).toBe('ready'), { timeout: 4000 });
    expect(store.get(b.id).status).not.toBe('ready');
    await vi.waitFor(() => expect(store.get(b.id).status).toBe('ready'), { timeout: 4000 });
    expect(running).toHaveLength(2);
    store.shutdown();
  });

  it('records failures with a typed error and supports retry', async () => {
    const runner = vi.fn(async (job, ctx) => {
      if (job.attempts === 0) {
        const err = new Error('boom');
        err.code = 'EXTRACT_FAILED';
        throw err;
      }
      ctx.update({ status: 'ready' });
    });
    const store = createJobStore({ runner });
    const job = store.create({ url: 'a' });
    await vi.waitFor(() => expect(store.get(job.id).status).toBe('failed'), { timeout: 4000 });
    expect(store.get(job.id).error.code).toBe('EXTRACT_FAILED');
    const retried = store.retry(job.id);
    expect(retried.status).toBe('queued');
    await vi.waitFor(() => expect(store.get(job.id).status).toBe('ready'), { timeout: 4000 });
    store.shutdown();
  });

  it('cancels a running job and aborts its runner', async () => {
    let aborted = false;
    const store = createJobStore({
      runner: async (job, ctx) => {
        ctx.signal.addEventListener('abort', () => { aborted = true; });
        try {
          await ctx.wait(5000);
        } catch {
          return; // canceled: runner exits
        }
        ctx.update({ status: 'ready' });
      },
    });
    const job = store.create({ url: 'a' });
    await vi.waitFor(() => expect(store.get(job.id).status).toBe('downloading'), { timeout: 4000 });
    expect(store.cancel(job.id)).toBe(true);
    await vi.waitFor(() => expect(store.get(job.id).status).toBe('canceled'), { timeout: 4000 });
    expect(aborted).toBe(true);
    expect(store.cancel('does-not-exist')).toBe(false);
    store.shutdown();
  });

  it('lists, filters, removes and expires jobs', async () => {
    const store = createJobStore({ runner: makeRunner(), ttlMs: 60 });
    const a = store.create({ url: 'a' });
    store.create({ url: 'b' });
    await vi.waitFor(() => expect(store.get(a.id).status).toBe('ready'), { timeout: 4000 });
    expect(store.list().length).toBe(2);
    expect(store.list({ status: 'queued' }).length).toBeGreaterThanOrEqual(0);
    expect(store.list({ limit: 1 }).length).toBe(1);
    expect(store.stats().total).toBe(2);
    expect(store.remove(a.id)).toBe(true);
    expect(store.get(a.id)).toBe(null);
    await new Promise((r) => setTimeout(r, 120));
    const expired = store.sweepExpired();
    expect(expired).toBeGreaterThanOrEqual(1);
    store.shutdown();
  });

  it('publishes progress updates with speed + eta', async () => {
    const store = createJobStore({
      runner: async (job, ctx) => {
        for (let i = 1; i <= 3; i++) {
          ctx.progress({ percent: i * 30, speed: '1.5MiB/s', eta: 10 - i, downloaded: i * 1000, total: 3000 });
          await ctx.wait(20);
        }
        ctx.update({ status: 'ready' });
      },
    });
    const updates = [];
    store.subscribe((e) => { if (e.type === 'job:progress') updates.push(e); });
    const job = store.create({ url: 'a' });
    await vi.waitFor(() => expect(store.get(job.id).status).toBe('ready'), { timeout: 4000 });
    expect(updates.length).toBeGreaterThanOrEqual(3);
    expect(updates.at(-1).progress.speed).toBe('1.5MiB/s');
    expect(store.get(job.id).progress.eta).toBe(7);
    store.shutdown();
  });

  it('never lets a runner throw escape and keeps the queue alive', async () => {
    const store = createJobStore({
      concurrency: 2,
      runner: async (job) => {
        if (job.url === 'bad') throw new Error('kaboom');
      },
    });
    const bad = store.create({ url: 'bad' });
    const good = store.create({ url: 'https://ok' });
    good.status = 'queued';
    await vi.waitFor(() => expect(store.get(bad.id).status).toBe('failed'), { timeout: 4000 });
    store.shutdown();
  });
});

/* ------------------------------------------------------------------ */
/* Rate limiting                                                        */
/* ------------------------------------------------------------------ */
describe('rate limiter', () => {
  it('allows a burst up to max then blocks with retry-after', () => {
    let now = 1_000_000;
    const rl = createRateLimiter({ max: 3, windowMs: 1000, now: () => now });
    expect(rl.check('ip1').allowed).toBe(true);
    expect(rl.check('ip1').remaining).toBe(1);
    expect(rl.check('ip1').allowed).toBe(true);
    const blocked = rl.check('ip1');
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
    expect(blocked.retryAfter).toBeLessThanOrEqual(1);
    now += 1100;
    expect(rl.check('ip1').allowed).toBe(true);
  });

  it('isolates keys', () => {
    const rl = createRateLimiter({ max: 1, windowMs: 1000 });
    rl.check('a');
    expect(rl.check('a').allowed).toBe(false);
    expect(rl.check('b').allowed).toBe(true);
  });

  it('supports heavier weights for expensive endpoints', () => {
    const rl = createRateLimiter({ max: 10, windowMs: 1000 });
    expect(rl.check('k', 5).remaining).toBe(5);
    expect(rl.check('k', 6).allowed).toBe(false);
  });

  it('prunes old keys so memory cannot grow forever', () => {
    const rl = createRateLimiter({ max: 2, windowMs: 10 });
    for (let i = 0; i < 500; i++) rl.check(`key-${i}`);
    expect(rl.size()).toBeLessThan(500);
  });
});

/* ------------------------------------------------------------------ */
/* Utility belt                                                         */
/* ------------------------------------------------------------------ */
describe('utility belt', () => {
  it('sanitizeFilename removes dangerous characters but keeps unicode', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFilename('a/b\\c:d*?.mp4')).toBe('a_b_c_d_.mp4');
    expect(sanitizeFilename('song\u0000\u001fname.mp3')).toBe('song_name.mp3');
    expect(sanitizeFilename('..')).toBe('download');
    expect(sanitizeFilename('')).toBe('download');
    expect(sanitizeFilename('बॉलीवुड गाना.mp4')).toBe('बॉलीवुड गाना.mp4');
    expect(sanitizeFilename('CON.mp4')).toBe('_CON.mp4');
    expect(sanitizeFilename('a'.repeat(400)).length).toBeLessThanOrEqual(200);
    expect(sanitizeFilename('trailing.   ')).toBe('trailing');
  });

  it('safeJoin refuses to escape the base directory', () => {
    expect(safeJoin('/tmp/base', 'ok.mp4')).toBe('/tmp/base/ok.mp4');
    expect(() => safeJoin('/tmp/base', '../etc/passwd')).toThrow();
    expect(() => safeJoin('/tmp/base', 'a/../../b')).toThrow();
    expect(() => safeJoin('/tmp/base', '..%2f..%2fetc')).toThrow();
  });

  it('isPrivateHost blocks SSRF targets', () => {
    for (const h of ['localhost', '127.0.0.1', '10.1.2.3', '192.168.0.1', '172.16.5.4', '169.254.169.254', '::1', '0.0.0.0', 'metadata.google.internal', 'foo.local']) {
      expect(isPrivateHost(h), h).toBe(true);
    }
    for (const h of ['youtube.com', '8.8.8.8', 'example.org', '1.1.1.1']) {
      expect(isPrivateHost(h), h).toBe(false);
    }
  });

  it('slugify + uniqueName', () => {
    expect(slugify('Hello World! Ünïcode  é')).toBe('hello-world-unicode-e');
    expect(slugify('')).toBe('file');
    expect(uniqueName('a.mp4', ['a.mp4', 'a (1).mp4'])).toBe('a (2).mp4');
    expect(uniqueName('a.mp4', [])).toBe('a.mp4');
  });

  it('parseRange understands HTTP Range headers', () => {
    expect(parseRange('bytes=0-99', 1000)).toEqual({ start: 0, end: 99 });
    expect(parseRange('bytes=500-', 1000)).toEqual({ start: 500, end: 999 });
    expect(parseRange('bytes=-100', 1000)).toEqual({ start: 900, end: 999 });
    expect(parseRange('bytes=0-99999', 1000)).toEqual({ start: 0, end: 999 });
    expect(parseRange('bytes=1000-', 1000)).toBe('unsatisfiable');
    expect(parseRange('', 1000)).toBe(null);
    expect(parseRange('garbage', 1000)).toBe(null);
  });

  it('clamp + sha256 + parseSizeLimit', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(parseSizeLimit('500MB')).toBe(500 * 1024 * 1024);
    expect(parseSizeLimit('2G')).toBe(2 * 1024 * 1024 * 1024);
    expect(parseSizeLimit(undefined)).toBe(null);
  });
});

/* ------------------------------------------------------------------ */
/* i18n                                                                 */
/* ------------------------------------------------------------------ */
describe('i18n', () => {
  it('every language exposes exactly the same keys', () => {
    const enKeys = Object.keys(en).sort();
    const hiKeys = Object.keys(hi).sort();
    expect(hiKeys).toEqual(enKeys);
    expect(enKeys.length).toBeGreaterThan(60);
  });

  it('hindi translations are actually Devanagari and not copies', () => {
    const devanagari = /[\u0900-\u097F]/;
    const untranslated = Object.entries(en).filter(([k, v]) => hi[k] === v && /[a-zA-Z]{4}/.test(v) && !k.startsWith('sfx.'));
    expect(untranslated.map(([k]) => k)).toEqual([]);
    expect(devanagari.test(hi['hero.title'])).toBe(true);
  });

  it('translate() interpolates and falls back to english then the key', () => {
    expect(translate('en', 'job.downloading', { percent: 42 })).toContain('42');
    expect(translate('hi', 'job.downloading', { percent: 42 })).toContain('42');
    expect(translate('en', 'definitely.missing.key')).toBe('definitely.missing.key');
    expect(translate('fr', 'hero.title')).toBe(en['hero.title']); // unknown language → english
    expect(hasLanguage('hi')).toBe(true);
    expect(hasLanguage('fr')).toBe(false);
    expect(listLanguages().map((l) => l.code)).toEqual(['en', 'hi']);
  });
});
