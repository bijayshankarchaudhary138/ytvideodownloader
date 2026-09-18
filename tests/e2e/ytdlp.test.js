/**
 * E2E with the REAL yt-dlp engine.
 *
 * The sandbox this repo was built in cannot reach youtube.com (egress blocked),
 * so instead of skipping the engine entirely we serve a generated MP4 over a
 * local HTTP server and let yt-dlp's generic extractor fetch it. That exercises
 * the production code path: spawn yt-dlp → parse progress → locate output →
 * serve bytes → verify playability.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { startTestServer, api, downloadToTemp, makeTempDir, waitForJob } from '../helpers/server.js';
import { probeMedia, generateSampleVideo } from '@server/core/ffmpeg.js';

let ctx;
let origin;
let mediaUrl;
let serveDir;

beforeAll(async () => {
  serveDir = await makeTempDir('ytvd-origin-');
  const file = path.join(serveDir, 'origin-sample.mp4');
  await generateSampleVideo(file, { seconds: 4, height: 480, fps: 15 });
  const bytes = await fs.readFile(file);

  origin = http.createServer((req, res) => {
    if (req.url === '/sample.mp4') {
      res.writeHead(200, { 'content-type': 'video/mp4', 'content-length': bytes.length, 'accept-ranges': 'bytes' });
      res.end(bytes);
    } else {
      res.writeHead(404).end('nope');
    }
  });
  await new Promise((r) => origin.listen(0, '127.0.0.1', r));
  mediaUrl = `http://127.0.0.1:${origin.address().port}/sample.mp4`;

  ctx = await startTestServer({ demoMode: 'off', allowPrivateHosts: true });
}, 120_000);

afterAll(async () => {
  await ctx?.close();
  await new Promise((r) => origin?.close(r));
  if (serveDir) await fs.rm(serveDir, { recursive: true, force: true });
});

describe('real yt-dlp integration', () => {
  it('reports demo mode off and both engines available', async () => {
    const { json } = await api(ctx.baseUrl, '/api/health');
    expect(json.mode).toBe('live');
    expect(json.engines.ytdlp.available).toBe(true);
    expect(json.engines.ffmpeg.available).toBe(true);
  }, 60_000);

  it('extracts metadata through yt-dlp and builds a format catalogue', async () => {
    const { status, json } = await api(ctx.baseUrl, '/api/info', { method: 'POST', body: { url: mediaUrl } });
    expect(status, JSON.stringify(json)).toBe(200);
    expect(json.video.title).toBeTruthy();
    expect(json.video.extractor).toBe('generic');
    expect(json.formats.combined.length + json.formats.video.length).toBeGreaterThan(0);
  }, 120_000);

  it('runs a full download job via yt-dlp and the result is playable', async () => {
    const created = await api(ctx.baseUrl, '/api/jobs', {
      method: 'POST',
      body: { url: mediaUrl, preset: 'best', title: 'Origin Sample' },
    });
    expect(created.status, JSON.stringify(created.json)).toBe(201);
    const job = await waitForJob(ctx.baseUrl, created.json.job.id, { timeoutMs: 180_000 });
    expect(job.status, JSON.stringify(job.error)).toBe('ready');
    expect(job.engine).toBe('yt-dlp');
    expect(job.filename).toMatch(/\.(mp4|mkv|webm)$/);

    const { file, bytes } = await downloadToTemp(`${ctx.baseUrl}${job.fileUrl}`);
    expect(bytes.length).toBeGreaterThan(10_000);
    const info = await probeMedia(file);
    expect(info.video.length).toBe(1);
    expect(info.audio.length).toBe(1);
  }, 300_000);

  it('extracts audio through yt-dlp + ffmpeg', async () => {
    const created = await api(ctx.baseUrl, '/api/jobs', {
      method: 'POST',
      body: { url: mediaUrl, preset: 'mp3-320' },
    });
    const job = await waitForJob(ctx.baseUrl, created.json.job.id, { timeoutMs: 180_000 });
    expect(job.status, JSON.stringify(job.error)).toBe('ready');
    const { file } = await downloadToTemp(`${ctx.baseUrl}${job.fileUrl}`);
    const info = await probeMedia(file);
    expect(info.audio[0].codec).toBe('mp3');
  }, 300_000);

  it('surfaces a friendly typed error for an unreachable URL (no stack traces)', async () => {
    const created = await api(ctx.baseUrl, '/api/jobs', {
      method: 'POST',
      body: { url: `http://127.0.0.1:${origin.address().port}/missing.mp4`, preset: 'best' },
    });
    const job = await waitForJob(ctx.baseUrl, created.json.job.id, { until: ['failed'], timeoutMs: 120_000 });
    expect(job.status).toBe('failed');
    expect(job.error.code).toBe('DOWNLOAD_FAILED');
    expect(JSON.stringify(job.error)).not.toMatch(/Traceback|\/home\/|node_modules/);
  }, 240_000);
});
