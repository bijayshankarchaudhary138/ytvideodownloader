/**
 * E2E: playlist / batch downloads → single ZIP, which is what desktop apps
 * charge money for. Verified by actually unzipping the archive.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { startTestServer, api, DEMO_PLAYLIST_URL, DEMO_URL, downloadToTemp, waitForJob } from '../helpers/server.js';
import { probeMedia } from '@server/core/ffmpeg.js';
import { readZipEntries } from '../../scripts/setup-binaries.mjs';

let ctx;
beforeAll(async () => { ctx = await startTestServer(); }, 60_000);
afterAll(async () => { await ctx?.close(); });

describe('playlist handling', () => {
  it('expands a playlist URL into one job per item', async () => {
    const res = await api(ctx.baseUrl, '/api/batch', {
      method: 'POST',
      body: { url: DEMO_PLAYLIST_URL, preset: 'mp4-240' },
    });
    expect(res.status, JSON.stringify(res.json)).toBe(201);
    const { batch } = res.json;
    expect(batch.total).toBeGreaterThan(1);
    expect(batch.jobs.length).toBe(batch.total);
    expect(batch.status).toMatch(/queued|running|done/);

    const status = await api(ctx.baseUrl, `/api/batch/${batch.id}`);
    expect(status.json.batch.total).toBe(batch.total);
    expect(status.json.batch.preset).toBe('mp4-240');
  }, 90_000);

  it('supports a multi-URL batch (paste several links at once)', async () => {
    const res = await api(ctx.baseUrl, '/api/batch', {
      method: 'POST',
      body: { urls: [DEMO_URL, `${DEMO_URL}&x=1`], preset: 'mp3-128' },
    });
    expect(res.status).toBe(201);
    expect(res.json.batch.total).toBe(2);
  }, 90_000);

  it('caps a batch and reports what was skipped instead of failing', async () => {
    const res = await api(ctx.baseUrl, '/api/batch', {
      method: 'POST',
      body: { url: DEMO_PLAYLIST_URL, preset: 'mp4-240', maxItems: 2 },
    });
    expect(res.status).toBe(201);
    expect(res.json.batch.total).toBeLessThanOrEqual(2);
    expect(res.json.batch.skipped).toBeGreaterThanOrEqual(1);
    expect(res.json.batch.note).toBeTruthy();
  }, 90_000);

  it('rejects a batch with an invalid preset or empty body', async () => {
    expect((await api(ctx.baseUrl, '/api/batch', { method: 'POST', body: {} })).status).toBe(400);
    expect((await api(ctx.baseUrl, '/api/batch', { method: 'POST', body: { url: DEMO_URL, preset: 'x' } })).status).toBe(400);
  });
});

describe('ZIP download', () => {
  it('builds a valid ZIP with one playable file per item', async () => {
    const created = await api(ctx.baseUrl, '/api/batch', {
      method: 'POST',
      body: { url: DEMO_PLAYLIST_URL, preset: 'mp4-240', maxItems: 3 },
    });
    const batchId = created.json.batch.id;
    const total = created.json.batch.total;

    // wait for the batch to finish
    let batch;
    for (let i = 0; i < 400; i++) {
      batch = (await api(ctx.baseUrl, `/api/batch/${batchId}`)).json.batch;
      if (batch.status === 'done' || batch.status === 'failed') break;
      await new Promise((r) => setTimeout(r, 250));
    }
    expect(batch.status).toBe('done');
    expect(batch.completed).toBe(total);

    const { file, bytes, res } = await downloadToTemp(`${ctx.baseUrl}/api/batch/${batchId}/zip`);
    expect(res.headers.get('content-type')).toMatch(/application\/zip/);
    expect(res.headers.get('content-disposition')).toMatch(/attachment; filename=.*\.zip/);

    const entries = readZipEntries(bytes).filter((e) => !e.name.endsWith('/'));
    expect(entries.length).toBe(total);
    for (const e of entries) {
      expect(e.name).toMatch(/\.mp4$/);
      expect(e.data.length).toBeGreaterThan(1000);
      const tmp = path.join(path.dirname(file), `z-${path.basename(e.name)}`);
      await fs.writeFile(tmp, e.data);
      const info = await probeMedia(tmp);
      expect(info.video.length).toBe(1);
      expect(info.audio.length).toBe(1);
    }
  }, 300_000);

  it('404s for an unknown batch', async () => {
    const res = await fetch(`${ctx.baseUrl}/api/batch/unknownbatch/zip`);
    expect(res.status).toBe(404);
  });

  it('tracks per-item job status inside the batch', async () => {
    const created = await api(ctx.baseUrl, '/api/batch', {
      method: 'POST',
      body: { url: DEMO_PLAYLIST_URL, preset: 'mp3-128', maxItems: 2 },
    });
    const { batch } = created.json;
    const first = await waitForJob(ctx.baseUrl, batch.jobs[0], { timeoutMs: 180_000 });
    expect(first.status).toBe('ready');
    const detail = await api(ctx.baseUrl, `/api/batch/${batch.id}`);
    expect(detail.json.batch.jobs.length).toBe(2);
    expect(detail.json.batch.completed).toBeGreaterThanOrEqual(1);
  }, 300_000);
});
