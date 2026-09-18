/**
 * E2E: performance budget. Competitors make you wait 10–40 s behind a queue;
 * we assert concrete numbers on this (2-core) machine.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTestServer, api, DEMO_URL, waitForJob, downloadToTemp } from '../helpers/server.js';

let ctx;
beforeAll(async () => {
  ctx = await startTestServer();
  await api(ctx.baseUrl, '/api/info', { method: 'POST', body: { url: DEMO_URL } }); // warm caches
}, 120_000);
afterAll(async () => { await ctx?.close(); });

describe('performance budget', () => {
  it('health endpoint stays under 50ms', async () => {
    const timings = [];
    for (let i = 0; i < 20; i++) {
      const t = Date.now();
      await api(ctx.baseUrl, '/api/health');
      timings.push(Date.now() - t);
    }
    timings.sort((a, b) => a - b);
    const p95 = timings[Math.floor(timings.length * 0.95) - 1];
    expect(p95).toBeLessThan(50);
  }, 60_000);

  it('cached /api/info answers in under 250ms', async () => {
    const t = Date.now();
    const res = await api(ctx.baseUrl, '/api/info', { method: 'POST', body: { url: DEMO_URL } });
    const ms = Date.now() - t;
    expect(res.json.cached).toBe(true);
    expect(ms).toBeLessThan(250);
  }, 60_000);

  it('cold /api/info (metadata + formats) answers in under 3s', async () => {
    const t = Date.now();
    const res = await api(ctx.baseUrl, '/api/info', { method: 'POST', body: { url: `${DEMO_URL}&cold=${Date.now()}` } });
    const ms = Date.now() - t;
    expect(res.status).toBe(200);
    expect(ms).toBeLessThan(3000);
  }, 60_000);

  it('a 240p video link is ready to download quickly, with a real format table first', async () => {
    const info = await api(ctx.baseUrl, '/api/info', { method: 'POST', body: { url: DEMO_URL } });
    expect(info.json.formats.video.length).toBeGreaterThan(2);

    const t0 = Date.now();
    const created = await api(ctx.baseUrl, '/api/jobs', { method: 'POST', body: { url: DEMO_URL, preset: 'mp4-240' } });
    const job = await waitForJob(ctx.baseUrl, created.json.job.id, { timeoutMs: 120_000 });
    const readyMs = Date.now() - t0;

    const t1 = Date.now();
    await downloadToTemp(`${ctx.baseUrl}${job.fileUrl}`);
    const ttfMs = Date.now() - t1;

    expect(readyMs).toBeLessThan(45_000);
    expect(ttfMs).toBeLessThan(5_000);
    // eslint-disable-next-line no-console
    console.warn(`[test-noise] ready=${readyMs}ms download=${ttfMs}ms`);
  }, 180_000);

  it('handles 4 concurrent jobs without serialising everything', async () => {
    const presets = ['mp4-240', 'mp4-360', 'mp3-128', 'm4a'];
    const t0 = Date.now();
    const created = await Promise.all(
      presets.map((preset) => api(ctx.baseUrl, '/api/jobs', { method: 'POST', body: { url: DEMO_URL, preset } })),
    );
    const jobs = await Promise.all(
      created.map((c) => waitForJob(ctx.baseUrl, c.json.job.id, { timeoutMs: 180_000 })),
    );
    expect(jobs.every((j) => j.status === 'ready')).toBe(true);
    expect(Date.now() - t0).toBeLessThan(120_000);
    // eslint-disable-next-line no-console
    console.warn(`[test-noise] 4 concurrent jobs in ${Date.now() - t0}ms`);
  }, 240_000);

  it('rejects rather than queueing forever when the queue is saturated', async () => {
    const small = await startTestServer({ maxQueueLength: 2, concurrency: 1 });
    try {
      const results = [];
      for (let i = 0; i < 4; i++) {
        results.push(await api(small.baseUrl, '/api/jobs', { method: 'POST', body: { url: DEMO_URL, preset: 'mp4-1080' } }));
      }
      const codes = results.map((r) => r.status);
      expect(codes).toContain(429);
      const rejected = results.find((r) => r.status === 429);
      expect(rejected.json.error.code).toBe('QUEUE_FULL');
    } finally {
      await small.close();
    }
  }, 180_000);
});
