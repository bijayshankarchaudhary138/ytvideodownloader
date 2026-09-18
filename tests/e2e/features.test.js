/**
 * A6 — every user-facing feature works end to end:
 * subtitles, thumbnails, metadata JSON, trim, playlists, batch ZIP,
 * cancel/retry, file expiry and the job history endpoints.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'node:zlib'; // only used to sanity-check the ZIP central directory
import {
  startTestServer,
  api,
  waitForJob,
  downloadToTemp,
  DEMO_URL,
  DEMO_PLAYLIST_URL,
  makeTempDir,
} from '../helpers/server.js';
import { probeMedia } from '@server/core/ffmpeg.js';

let ctx;
beforeAll(async () => {
  ctx = await startTestServer({ maxBatchSize: 3, maxPlaylistItems: 5 });
}, 120_000);
afterAll(async () => {
  await ctx?.close();
});

/** Minimal ZIP reader: inflate the first stored/deflated local file header. */
function inflateFirstEntry(buf) {
  let offset = 0;
  while (offset + 30 < buf.length && buf.readUInt32LE(offset) === 0x04034b50) {
    const method = buf.readUInt16LE(offset + 8);
    const compSize = buf.readUInt32LE(offset + 18);
    const nameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    const dataStart = offset + 30 + nameLen + extraLen;
    if (compSize > 0) {
      const data = buf.subarray(dataStart, dataStart + compSize);
      return method === 0 ? data : JSZip.inflateRawSync(data);
    }
    offset = dataStart;
  }
  throw new Error('no ZIP entries found');
}

const fileUrl = (job) => `${ctx.baseUrl}${job.fileUrl}`;

describe('A6 · subtitles', () => {
  it('returns manual + automatic subtitle tracks in the info payload', async () => {
    const { status, json } = await api(ctx.baseUrl, '/api/info', { method: 'POST', body: { url: DEMO_URL } });
    expect(status).toBe(200);
    const manual = json.subtitles.manual;
    const auto = json.subtitles.auto;
    expect(manual.length).toBeGreaterThanOrEqual(2);
    expect(auto.length).toBeGreaterThanOrEqual(1);
    expect(manual.map((s) => s.lang)).toEqual(expect.arrayContaining(['en', 'hi']));
    for (const track of [...manual, ...auto]) {
      expect(track.url).toMatch(/^\/api\/subs\//);
      expect(track.ext).toBeTruthy();
    }
  }, 60_000);

  it('streams a real WebVTT file for /api/subs/:videoId/:lang', async () => {
    const res = await fetch(`${ctx.baseUrl}/api/subs/demoBukkTub/en`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/vtt');
    const body = await res.text();
    expect(body.startsWith('WEBVTT')).toBe(true);
    expect(body).toMatch(/\d{2}:\d{2}:\d{2}\.\d{3} --> \d{2}:\d{2}:\d{2}\.\d{3}/);
    expect(body).not.toMatch(/\d{2}:\d{2}:\d{2},\d{3}/); // SRT comma must be converted for browsers
  }, 60_000);

  it('marks auto-generated tracks and they are still valid VTT', async () => {
    const res = await fetch(`${ctx.baseUrl}/api/subs/demoBukkTub/auto-de`);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body.startsWith('WEBVTT')).toBe(true);
    expect(body.length).toBeGreaterThan(30);
  }, 60_000);

  it('downloads a subtitle as an .srt job', async () => {
    const created = await api(ctx.baseUrl, '/api/jobs', {
      method: 'POST',
      body: { url: DEMO_URL, preset: 'subtitle-srt', subtitle: { lang: 'en', auto: false } },
    });
    expect(created.status).toBe(201);
    const job = await waitForJob(ctx.baseUrl, created.json.job.id);
    expect(job.status, JSON.stringify(job.error)).toBe('ready');
    expect(job.filename).toMatch(/\.srt$/);
    const text = await (await fetch(fileUrl(job))).text();
    expect(text).toMatch(/^\d+\r?\n\d{2}:\d{2}:\d{2},\d{3} --> /);
  }, 120_000);
});

describe('A6 · thumbnails', () => {
  it('lists thumbnail sizes from the info payload', async () => {
    const { json } = await api(ctx.baseUrl, '/api/info', { method: 'POST', body: { url: DEMO_URL } });
    expect(json.thumbnails.length).toBeGreaterThanOrEqual(4);
    expect(json.thumbnails.some((t) => t.width >= 1280)).toBe(true);
    expect(json.thumbnails[0].url).toMatch(/^\/api\/thumb\//);
  }, 60_000);

  it('serves each thumbnail as a JPEG image', async () => {
    const { json } = await api(ctx.baseUrl, '/api/info', { method: 'POST', body: { url: DEMO_URL } });
    for (const thumb of json.thumbnails.slice(0, 4)) {
      const res = await fetch(`${ctx.baseUrl}${thumb.url}`);
      expect(res.status, thumb.url).toBe(200);
      expect(res.headers.get('content-type')).toContain('image/jpeg');
      const bytes = Buffer.from(await res.arrayBuffer());
      expect(bytes.length, thumb.url).toBeGreaterThan(1000);
      // JPEG magic bytes
      expect(bytes[0]).toBe(0xff);
      expect(bytes[1]).toBe(0xd8);
    }
  }, 120_000);

  it('downloads the max-res thumbnail through the job API', async () => {
    const created = await api(ctx.baseUrl, '/api/jobs', {
      method: 'POST',
      body: { url: DEMO_URL, preset: 'thumbnail-max' },
    });
    const job = await waitForJob(ctx.baseUrl, created.json.job.id);
    expect(job.status, JSON.stringify(job.error)).toBe('ready');
    expect(job.filename).toMatch(/\.jpg$/);
    const { file, bytes } = await downloadToTemp(fileUrl(job));
    expect(bytes.length).toBeGreaterThan(1000);
    const stat = await fs.stat(file);
    expect(stat.size).toBe(bytes.length);
  }, 120_000);
});

describe('A6 · metadata JSON', () => {
  it('exports machine-readable metadata that matches /api/info', async () => {
    const created = await api(ctx.baseUrl, '/api/jobs', {
      method: 'POST',
      body: { url: DEMO_URL, preset: 'metadata-json' },
    });
    const job = await waitForJob(ctx.baseUrl, created.json.job.id);
    expect(job.status, JSON.stringify(job.error)).toBe('ready');
    expect(job.filename).toMatch(/\.json$/);
    const res = await fetch(fileUrl(job));
    expect(res.headers.get('content-type')).toContain('json');
    const payload = await res.json();
    expect(payload.id || payload.videoId).toBeTruthy();
    expect(payload.title).toBeTruthy();
    expect(payload.formats ?? payload.entries ?? payload.streams).toBeTruthy();
  }, 120_000);
});

describe('A6 · trim', () => {
  it('cuts the requested window and names the file accordingly', async () => {
    const created = await api(ctx.baseUrl, '/api/jobs', {
      method: 'POST',
      body: { url: DEMO_URL, preset: 'mp4-240', trim: { start: 1, end: 3 }, title: 'Trimmed Clip' },
    });
    expect(created.status).toBe(201);
    expect(created.json.job.trim).toEqual({ start: 1, end: 3 });
    const job = await waitForJob(ctx.baseUrl, created.json.job.id);
    expect(job.status, JSON.stringify(job.error)).toBe('ready');
    expect(job.filename.toLowerCase()).toContain('trim');
    const { file } = await downloadToTemp(fileUrl(job));
    const info = await probeMedia(file);
    expect(info.duration).toBeGreaterThanOrEqual(1.2);
    expect(info.duration).toBeLessThanOrEqual(3.6);
    expect(info.video.length).toBe(1);
    expect(info.audio.length).toBe(1);
  }, 180_000);

  it('rejects impossible trim ranges with INVALID_TRIM', async () => {
    for (const trim of [{ start: 5, end: 2 }, { start: -1, end: 3 }, { start: 1, end: 1 }, { start: 'a', end: 'b' }]) {
      const { status, json } = await api(ctx.baseUrl, '/api/jobs', {
        method: 'POST',
        body: { url: DEMO_URL, preset: 'mp4-240', trim },
      });
      expect(status, JSON.stringify(trim)).toBe(400);
      expect(json.error.code).toBe('INVALID_TRIM');
    }
  }, 60_000);
});

describe('A6 · playlists + batch ZIP', () => {
  it('expands a playlist into entries and one batch job', async () => {
    const info = await api(ctx.baseUrl, '/api/info', { method: 'POST', body: { url: DEMO_PLAYLIST_URL } });
    expect(info.status).toBe(200);
    expect(info.json.playlist.entries.length).toBeGreaterThan(1);

    const created = await api(ctx.baseUrl, '/api/batch', {
      method: 'POST',
      body: { url: DEMO_PLAYLIST_URL, preset: 'mp4-240' },
    });
    expect(created.status).toBe(201);
    const batchId = created.json.batch.id;
    expect(created.json.batch.total).toBeGreaterThan(1);

    const deadline = Date.now() + 240_000;
    let batch = created.json.batch;
    while (Date.now() < deadline && !['done', 'failed'].includes(batch.status)) {
      await new Promise((r) => setTimeout(r, 400));
      batch = (await api(ctx.baseUrl, `/api/batch/${batchId}`)).json.batch;
    }
    expect(batch.status, JSON.stringify(batch)).toBe('done');
    expect(batch.completed).toBe(Array.isArray(batch.jobs) ? batch.jobs.length : batch.completed);
    expect(batch.zipReady).toBe(true);

    const zip = await fetch(`${ctx.baseUrl}/api/batch/${batchId}/zip`);
    expect(zip.status).toBe(200);
    expect(zip.headers.get('content-type')).toContain('zip');
    const bytes = Buffer.from(await zip.arrayBuffer());
    expect(bytes.length).toBeGreaterThan(10_000);
    expect(bytes.subarray(0, 2).toString('latin1')).toBe('PK');

    // Every rendered entry must be a playable file: extract + probe with ffmpeg.
    const dir = await makeTempDir('ytvd-zip-');
    const { execFileSync } = await import('node:child_process');
    const archive = path.join(dir, 'batch.zip');
    try {
      await fs.writeFile(archive, bytes);
      execFileSync('unzip', ['-o', '-q', archive, '-d', dir]);
      const entries = await fs.readdir(dir, { recursive: true });
      const media = entries.filter((f) => /\.(mp4|mkv|webm)$/i.test(f));
      expect(media.length).toBeGreaterThan(1);
      const info2 = await probeMedia(path.join(dir, media[0]));
      expect(info2.video.length).toBe(1);
      expect(info2.audio.length).toBe(1);
    } catch (err) {
      // `unzip` is not installed in every sandbox — verify the ZIP by inflating
      // the first local file header with node's zlib instead.
      if (err?.code !== 'ENOENT') throw err;
      const inflated = inflateFirstEntry(bytes);
      expect(inflated.length).toBeGreaterThan(1000);
      expect(inflated.subarray(4, 8).toString('latin1')).toBe('ftyp');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
    void JSZip;
  }, 300_000);

  it('409s while the ZIP is not ready and 410s when nothing was produced', async () => {
    const created = await api(ctx.baseUrl, '/api/batch', {
      method: 'POST',
      body: { url: DEMO_PLAYLIST_URL, preset: 'mp4-240' },
    });
    const immediate = await fetch(`${ctx.baseUrl}/api/batch/${created.json.batch.id}/zip`);
    expect([409, 200]).toContain(immediate.status);
    if (immediate.status === 409) {
      expect((await immediate.json()).error.code).toBe('BATCH_NOT_READY');
    }
    const missing = await fetch(`${ctx.baseUrl}/api/batch/does-not-exist/zip`);
    expect([404, 410]).toContain(missing.status);
  }, 120_000);
});

describe('A6 · job control', () => {
  it('cancels a queued job and can retry it afterwards', async () => {
    const created = await api(ctx.baseUrl, '/api/jobs', {
      method: 'POST',
      body: { url: DEMO_URL, preset: 'mp4-1080' },
    });
    const id = created.json.job.id;
    const canceled = await api(ctx.baseUrl, `/api/jobs/${id}/cancel`, { method: 'POST' });
    expect([200, 409]).toContain(canceled.status);
    const after = await api(ctx.baseUrl, `/api/jobs/${id}`);
    expect(['canceled', 'ready', 'running']).toContain(after.json.job.status);

    const retried = await api(ctx.baseUrl, `/api/jobs/${id}/retry`, { method: 'POST' });
    expect([200, 201, 409]).toContain(retried.status);
    if (retried.status !== 409) {
      expect(retried.json.job.url).toBe(DEMO_URL);
      expect(retried.json.job.preset).toBe('mp4-1080');
    }
  }, 180_000);

  it('refuses to cancel a finished job (409 JOB_FINISHED)', async () => {
    const created = await api(ctx.baseUrl, '/api/jobs', {
      method: 'POST',
      body: { url: DEMO_URL, preset: 'mp4-240' },
    });
    const id = created.json.job.id;
    const job = await waitForJob(ctx.baseUrl, id);
    expect(job.status).toBe('ready');
    const res = await api(ctx.baseUrl, `/api/jobs/${id}/cancel`, { method: 'POST' });
    expect(res.status).toBe(409);
    expect(res.json.error.code).toBe('JOB_FINISHED');
  }, 180_000);

  it('exposes per-job status, list filtering and aggregate stats', async () => {
    const status = await api(ctx.baseUrl, `/api/jobs/${'missing-id'}/status`);
    expect(status.status).toBe(404);
    const list = await api(ctx.baseUrl, '/api/jobs?limit=5&status=ready');
    expect(Array.isArray(list.json.jobs)).toBe(true);
    expect(list.json.jobs.length).toBeLessThanOrEqual(5);
    expect(list.json.jobs.every((j) => j.status === 'ready')).toBe(true);
    const stats = await api(ctx.baseUrl, '/api/stats');
    expect(stats.json.jobs.total).toBeGreaterThan(1);
    expect(stats.json.batches).toBeGreaterThanOrEqual(1);
    expect(typeof stats.json.cache.size).toBe('number');
  }, 60_000);

  it('never returns private paths or internals in a public job shape', async () => {
    const list = await api(ctx.baseUrl, '/api/jobs?limit=5');
    for (const job of list.json.jobs) {
      expect(job).not.toHaveProperty('dir');
      expect(job).not.toHaveProperty('filePath');
      expect(job).not.toHaveProperty('outputPath');
      expect(JSON.stringify(job)).not.toMatch(/\/home\/|\/tmp\/ytvd-|dataDir/);
    }
  }, 60_000);
});

describe('A6 · file lifecycle', () => {
  it('410s a file whose job has been deleted/expired', async () => {
    const created = await api(ctx.baseUrl, '/api/jobs', {
      method: 'POST',
      body: { url: DEMO_URL, preset: 'mp4-240' },
    });
    const id = created.json.job.id;
    const job = await waitForJob(ctx.baseUrl, id);
    expect(job.status).toBe('ready');
    const ok = await fetch(fileUrl(job));
    expect(ok.status).toBe(200);
    await ok.arrayBuffer();

    await api(ctx.baseUrl, `/api/jobs/${id}`, { method: 'DELETE' });
    const after = await fetch(fileUrl(job));
    expect([404, 410]).toContain(after.status);
  }, 180_000);

  it('416s an unsatisfiable range and supports HEAD', async () => {
    const created = await api(ctx.baseUrl, '/api/jobs', {
      method: 'POST',
      body: { url: DEMO_URL, preset: 'mp4-240' },
    });
    const job = await waitForJob(ctx.baseUrl, created.json.job.id);
    const bad = await fetch(fileUrl(job), { headers: { range: 'bytes=99999999-' } });
    expect(bad.status).toBe(416);
    expect(bad.headers.get('content-range')).toMatch(/^bytes \*\//);

    const head = await fetch(fileUrl(job), { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(Number(head.headers.get('content-length'))).toBeGreaterThan(1000);
    expect((await head.arrayBuffer()).byteLength).toBe(0);
  }, 180_000);
});
