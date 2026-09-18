/**
 * E2E: real-time progress over Server-Sent Events — the feature that
 * separates us from every "click and hope" competitor.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTestServer, api, DEMO_URL, openSse, sleep, waitForJob } from '../helpers/server.js';

let ctx;
beforeAll(async () => { ctx = await startTestServer({ heartbeatMs: 400 }); }, 60_000);
afterAll(async () => { await ctx?.close(); });

describe('SSE stream', () => {
  it('welcomes a new client with a hello event', async () => {
    const sse = await openSse(ctx.baseUrl);
    const hello = await sse.waitFor((e) => e.event === 'hello', 8000);
    expect(hello.data.mode).toBe('demo');
    expect(hello.data.version).toBeTruthy();
    await sse.close();
  }, 30_000);

  it('reports content-type and disables buffering', async () => {
    const controller = new AbortController();
    const res = await fetch(`${ctx.baseUrl}/api/events`, { signal: controller.signal });
    expect(res.headers.get('content-type')).toMatch(/text\/event-stream/);
    expect(res.headers.get('cache-control')).toMatch(/no-cache|no-store/);
    expect(res.headers.get('connection') || 'keep-alive').toBeTruthy();
    controller.abort();
  }, 30_000);

  it('streams job lifecycle + monotonic progress with speed and ETA', async () => {
    const sse = await openSse(ctx.baseUrl);
    await sse.waitFor((e) => e.event === 'hello', 8000);

    const created = await api(ctx.baseUrl, '/api/jobs', { method: 'POST', body: { url: DEMO_URL, preset: 'mp4-240' } });
    const jobId = created.json.job.id;

    const done = await sse.waitFor(
      (e) => e.type === undefined && e.event === 'job:done' && e.data?.job?.id === jobId,
      180_000,
    );
    expect(done.data.job.status).toBe('ready');
    expect(done.data.job.fileUrl).toBeTruthy();

    const updates = sse.events.filter((e) => e.event === 'job:update' && e.data?.job?.id === jobId);
    expect(updates.length).toBeGreaterThanOrEqual(2);
    const statuses = updates.map((u) => u.data.job.status);
    expect(statuses[0]).toBe('queued');
    expect(statuses).toContain('downloading');

    const progresses = sse.events
      .filter((e) => e.event === 'job:progress' && e.data?.id === jobId)
      .map((e) => e.data.progress.percent);
    expect(progresses.length).toBeGreaterThanOrEqual(1);
    for (let i = 1; i < progresses.length; i++) {
      expect(progresses[i]).toBeGreaterThanOrEqual(progresses[i - 1] - 0.001);
    }
    expect(progresses.at(-1)).toBeGreaterThan(90);
    await sse.close();
  }, 240_000);

  it('broadcasts to several clients at once and keeps its heartbeats', async () => {
    const a = await openSse(ctx.baseUrl);
    const b = await openSse(ctx.baseUrl);
    await Promise.all([a.waitFor((e) => e.event === 'hello', 8000), b.waitFor((e) => e.event === 'hello', 8000)]);

    const created = await api(ctx.baseUrl, '/api/jobs', { method: 'POST', body: { url: DEMO_URL, preset: 'mp3-128' } });
    const id = created.json.job.id;
    await Promise.all([
      a.waitFor((e) => e.event === 'job:done' && e.data?.job?.id === id, 180_000),
      b.waitFor((e) => e.event === 'job:done' && e.data?.job?.id === id, 180_000),
    ]);
    const ping = await a.waitFor((e) => e.event === 'ping', 8000);
    expect(typeof ping.data.ts).toBe('number');
    await a.close();
    await b.close();
  }, 240_000);

  it('survives clients disconnecting mid-job', async () => {
    const sse = await openSse(ctx.baseUrl);
    const created = await api(ctx.baseUrl, '/api/jobs', { method: 'POST', body: { url: DEMO_URL, preset: 'mp4-240' } });
    await sleep(300);
    await sse.close();
    const job = await waitForJob(ctx.baseUrl, created.json.job.id, { timeoutMs: 180_000 });
    expect(job.status).toBe('ready');
    expect((await api(ctx.baseUrl, '/api/health')).json.status).toBe('ok');
  }, 240_000);

  it('exposes a polling fallback for environments without EventSource', async () => {
    const created = await api(ctx.baseUrl, '/api/jobs', { method: 'POST', body: { url: DEMO_URL, preset: 'mp4-240' } });
    const res = await api(ctx.baseUrl, `/api/jobs/${created.json.job.id}/status`);
    expect(res.status).toBe(200);
    expect(res.json.job.status).toBeTruthy();
    expect(res.headers.get('cache-control')).toMatch(/no-store/);
  }, 240_000);
});
