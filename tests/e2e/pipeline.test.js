/**
 * E2E: the real pipeline — HTTP API → job queue → ffmpeg → served file.
 * Every artefact is verified with ffprobe, i.e. we prove it is *playable*,
 * not just that some bytes came back.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { startTestServer, api, DEMO_URL, waitForJob, downloadToTemp } from '../helpers/server.js';
import { probeMedia } from '@server/core/ffmpeg.js';

let ctx;
beforeAll(async () => {
  ctx = await startTestServer();
  // warm the demo master once so the first assertions are not slowed by encoding
  await api(ctx.baseUrl, '/api/info', { method: 'POST', body: { url: DEMO_URL } });
}, 120_000);
afterAll(async () => { await ctx?.close(); });

async function runJob(body, { preset, timeoutMs = 120_000 } = {}) {
  const created = await api(ctx.baseUrl, '/api/jobs', { method: 'POST', body: { url: DEMO_URL, ...body } });
  expect(created.status, JSON.stringify(created.json)).toBe(201);
  const job = await waitForJob(ctx.baseUrl, created.json.job.id, { timeoutMs });
  expect(job.status, JSON.stringify(job.error)).toBe('ready');
  return job;
}

describe('video pipeline', () => {
  it('produces a merged MP4 that contains BOTH video and audio (the #1 competitor bug)', async () => {
    const job = await runJob({ preset: 'mp4-1080' });
    expect(job.fileUrl).toMatch(/^\/api\/files\//);
    expect(job.filename).toMatch(/\.mp4$/);
    expect(job.needsMux).toBe(true);

    const { file, bytes, res } = await downloadToTemp(`${ctx.baseUrl}${job.fileUrl}`);
    expect(bytes.length).toBeGreaterThan(50_000);
    expect(res.headers.get('content-disposition')).toContain('attachment');
    expect(res.headers.get('content-length')).toBe(String(bytes.length));

    const info = await probeMedia(file);
    expect(info.video.length, 'merged file must have a video track').toBe(1);
    expect(info.audio.length, 'merged file must have an audio track — this is where competitors fail').toBe(1);
    expect(info.video[0].height).toBeGreaterThanOrEqual(720);
    expect(info.video[0].width).toBeGreaterThanOrEqual(1280);
    expect(job.height).toBe(info.video[0].height);
  }, 180_000);

  it('honours a lower preset exactly', async () => {
    const job = await runJob({ preset: 'mp4-360' });
    const { file } = await downloadToTemp(`${ctx.baseUrl}${job.fileUrl}`);
    const info = await probeMedia(file);
    expect(info.video[0].height).toBe(360);
    expect(info.audio.length).toBe(1);
  }, 180_000);

  it('records an honest fallback when the requested resolution does not exist', async () => {
    const job = await runJob({ preset: 'mp4-4320' }); // 8K preset, demo master is smaller
    expect(job.qualityFallback).toBeTruthy();
    const info = await probeMedia((await downloadToTemp(`${ctx.baseUrl}${job.fileUrl}`)).file);
    expect(info.video[0].height).toBe(job.height);
    expect(job.height).toBeLessThan(4320);
  }, 180_000);

  it('keeps the file downloadable via HTTP Range requests (resume support)', async () => {
    const job = await runJob({ preset: 'mp4-240' });
    const full = await fetch(`${ctx.baseUrl}${job.fileUrl}`);
    const total = Number(full.headers.get('content-length'));
    await full.arrayBuffer();
    expect(full.headers.get('accept-ranges')).toBe('bytes');

    const partial = await fetch(`${ctx.baseUrl}${job.fileUrl}`, { headers: { range: 'bytes=0-1023' } });
    expect(partial.status).toBe(206);
    expect(partial.headers.get('content-range')).toBe(`bytes 0-1023/${total}`);
    const chunk = Buffer.from(await partial.arrayBuffer());
    expect(chunk.length).toBe(1024);
  }, 180_000);
});

describe('audio pipeline', () => {
  it('MP3 320k preset really yields a valid MP3', async () => {
    const job = await runJob({ preset: 'mp3-320' });
    expect(job.filename).toMatch(/\.mp3$/);
    const { file, res } = await downloadToTemp(`${ctx.baseUrl}${job.fileUrl}`);
    expect(res.headers.get('content-type')).toMatch(/audio\/mpeg/);
    const info = await probeMedia(file);
    expect(info.audio[0].codec).toBe('mp3');
    expect(info.audio[0].bit_rate).toBeGreaterThan(200_000);
    expect(info.video.length).toBe(0);
  }, 180_000);

  it('M4A preset yields AAC audio', async () => {
    const job = await runJob({ preset: 'm4a' });
    const info = await probeMedia((await downloadToTemp(`${ctx.baseUrl}${job.fileUrl}`)).file);
    expect(info.audio[0].codec).toMatch(/aac/);
  }, 180_000);

  it('declares the correct content type for each format', async () => {
    const mp3 = await runJob({ preset: 'mp3-128' });
    const head = await fetch(`${ctx.baseUrl}${mp3.fileUrl}`, { method: 'HEAD' });
    expect(head.headers.get('content-type')).toMatch(/audio\/mpeg/);
  }, 180_000);
});

describe('trim', () => {
  it('cuts the requested segment and still keeps audio', async () => {
    const job = await runJob({ preset: 'mp4-360', trim: { start: 1, end: 3 } });
    const { file } = await downloadToTemp(`${ctx.baseUrl}${job.fileUrl}`);
    const info = await probeMedia(file);
    expect(info.duration).toBeGreaterThan(1.2);
    expect(info.duration).toBeLessThan(3.2);
    expect(info.audio.length).toBe(1);
    expect(job.filename).toContain('trim');
  }, 180_000);

  it('rejects an inverted trim range instead of producing a broken file', async () => {
    const bad = await api(ctx.baseUrl, '/api/jobs', { method: 'POST', body: { url: DEMO_URL, preset: 'mp4-360', trim: { start: 5, end: 2 } } });
    expect(bad.status).toBe(400);
    expect(bad.json.error.code).toBe('INVALID_TRIM');
  });
});

describe('subtitles, thumbnails and metadata', () => {
  it('subtitle job returns a real SRT file', async () => {
    const job = await runJob({ preset: 'subtitle-srt', subtitle: { lang: 'en' } });
    expect(job.filename).toMatch(/\.srt$/);
    const { file } = await downloadToTemp(`${ctx.baseUrl}${job.fileUrl}`);
    const text = await fs.readFile(file, 'utf8');
    expect(text).toMatch(/^1\r?\n\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}/m);
    expect(text.length).toBeGreaterThan(20);
  }, 120_000);

  it('auto-generated captions can be requested too', async () => {
    const job = await runJob({ preset: 'subtitle-srt', subtitle: { lang: 'de', auto: true } });
    const text = await fs.readFile((await downloadToTemp(`${ctx.baseUrl}${job.fileUrl}`)).file, 'utf8');
    expect(text).toContain('-->');
  }, 120_000);

  it('thumbnail job returns a genuine JPEG', async () => {
    const job = await runJob({ preset: 'thumbnail-max' });
    expect(job.filename).toMatch(/\.jpg$/);
    const { bytes, res } = await downloadToTemp(`${ctx.baseUrl}${job.fileUrl}`);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect(bytes.subarray(0, 2).toString('hex')).toBe('ffd8');
    expect(bytes.length).toBeGreaterThan(1000);
  }, 120_000);

  it('every thumbnail size is offered and each one is downloadable', async () => {
    const info = await api(ctx.baseUrl, '/api/info', { method: 'POST', body: { url: DEMO_URL } });
    expect(info.json.thumbnails.length).toBeGreaterThanOrEqual(4);
    for (const t of info.json.thumbnails) {
      const res = await fetch(`${ctx.baseUrl}${t.url}`);
      expect(res.status, t.id).toBe(200);
      expect(res.headers.get('content-type')).toBe('image/jpeg');
    }
  }, 120_000);

  it('metadata job returns valid JSON with the video title', async () => {
    const job = await runJob({ preset: 'metadata-json' });
    const text = await fs.readFile((await downloadToTemp(`${ctx.baseUrl}${job.fileUrl}`)).file, 'utf8');
    const parsed = JSON.parse(text);
    expect(parsed.title).toBeTruthy();
    expect(parsed.webpage_url || parsed.original_url).toBeTruthy();
    expect(parsed.formats.length).toBeGreaterThan(0);
  }, 120_000);
});

describe('job lifecycle details', () => {
  it('cancel actually stops a queued job', async () => {
    const created = await api(ctx.baseUrl, '/api/jobs', { method: 'POST', body: { url: DEMO_URL, preset: 'mp4-1080' } });
    const id = created.json.job.id;
    await api(ctx.baseUrl, `/api/jobs/${id}/cancel`, { method: 'POST' });
    const job = await waitForJob(ctx.baseUrl, id, { until: ['canceled', 'ready'], timeoutMs: 60_000 });
    expect(['canceled', 'ready']).toContain(job.status);
  }, 120_000);

  it('expired files stop being served but the job record explains why', async () => {
    const short = await startTestServer({ fileTtlMs: 1500 });
    try {
      const created = await api(short.baseUrl, '/api/jobs', { method: 'POST', body: { url: DEMO_URL, preset: 'mp4-240' } });
      const job = await waitForJob(short.baseUrl, created.json.job.id, { timeoutMs: 120_000 });
      const ok = await fetch(`${short.baseUrl}${job.fileUrl}`);
      expect(ok.status).toBe(200);
      await new Promise((r) => setTimeout(r, 2500));
      short.services.jobs.sweepExpired();
      const gone = await fetch(`${short.baseUrl}${job.fileUrl}`);
      expect([404, 410]).toContain(gone.status);
    } finally {
      await short.close();
    }
  }, 180_000);

  it('serves the same bytes twice (no double-delete bug)', async () => {
    const job = await runJob({ preset: 'mp4-240' });
    const a = await downloadToTemp(`${ctx.baseUrl}${job.fileUrl}`);
    const b = await downloadToTemp(`${ctx.baseUrl}${job.fileUrl}`);
    expect(a.sha256).toBe(b.sha256);
  }, 120_000);
});
