#!/usr/bin/env node
/**
 * Post-install smoke test: "is this checkout actually working?"
 *
 *   npm run verify           # real engine (yt-dlp + ffmpeg) against a local clip
 *   npm run verify -- --demo # bundled sample media, no network at all
 *
 * It boots the real Express app on an ephemeral port, drives it over HTTP exactly
 * like a browser would, and reports a pass/fail table. Exit code 1 on any failure,
 * so it is safe to use in CI or a Docker healthcheck script.
 */
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { loadConfig, ROOT_DIR } from '../server/src/config.js';
import { createApp } from '../server/src/http/app.js';
import { probeMedia, generateSampleVideo, ffmpegBin, ffprobeBin } from '../server/src/core/ffmpeg.js';
import { ytdlpVersion } from '../server/src/core/engine.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const demoOnly = process.argv.slice(2).includes('--demo');

const results = [];
let failures = 0;

async function check(group, name, fn) {
  const started = Date.now();
  try {
    const detail = await fn();
    results.push({ group, name, ok: true, detail: detail || '', ms: Date.now() - started });
    process.stdout.write(`✓ ${name} (${Date.now() - started} ms)${detail ? `  ${detail}` : ''}\n`);
  } catch (err) {
    failures += 1;
    const message = (err && err.message) || String(err);
    results.push({ group, name, ok: false, detail: message, ms: Date.now() - started });
    process.stdout.write(`✗ ${name}  → ${message}\n`);
  }
}

function run(bin, args, { timeoutMs = 30_000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => { clearTimeout(timer); resolve({ code: -1, out, err: e.message }); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, out, err }); });
  });
}

const jsonFetch = async (url, init = {}) => {
  const res = await fetch(url, {
    headers: { 'content-type': 'application/json' },
    ...init,
    body: init.body && typeof init.body !== 'string' ? JSON.stringify(init.body) : init.body,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { res, status: res.status, json, text };
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForJob(baseUrl, id, { timeoutMs = 240_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    const { json } = await jsonFetch(`${baseUrl}/api/jobs/${id}`);
    last = json?.job ?? json;
    if (last && ['ready', 'failed', 'canceled'].includes(last.status)) return last;
    await sleep(200);
  }
  throw new Error(`timed out waiting for job ${id} (last=${last?.status ?? 'unknown'})`);
}

/* ------------------------------------------------------------------ main */

const started = Date.now();
const label = demoOnly ? 'demo mode' : 'real engine (yt-dlp + ffmpeg)';
console.log(`\nytvideodownloader · verify · node ${process.version} · ${label}\n`);

let ctx = null;
let origin = null;
let workDir = null;

try {
  /* 1. binaries ------------------------------------------------------- */
  await check('binaries', 'bundled ffmpeg responds', async () => {
    const bin = ffmpegBin();
    const { code, out, err } = await run(bin, ['-version']);
    if (code !== 0) throw new Error(err.trim().split('\n')[0] || `exit ${code}`);
    const version = (out.match(/version (\S+)/) || [])[1] || 'unknown';
    return `v${version} · ${path.relative(ROOT, bin)}`;
  });

  await check('binaries', 'ffprobe responds (-print_format json)', async () => {
    const bin = ffprobeBin();
    if (!bin) throw new Error('no ffprobe found — run `npm run setup`');
    const { code, out } = await run(bin, ['-version']);
    if (code !== 0) throw new Error(`exit ${code}`);
    return out.trim().split('\n')[0];
  });

  if (!demoOnly) {
    await check('binaries', 'yt-dlp is importable', async () => {
      const version = await ytdlpVersion();
      if (!version) throw new Error('yt-dlp unavailable — run `npm run setup`');
      return `v${version}`;
    });
  }

  /* 2. boot the server ------------------------------------------------ */
  workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ytvd-verify-'));
  const config = loadConfig({
    dataDir: workDir,
    demoMode: demoOnly ? 'on' : 'off',
    host: '127.0.0.1',
    port: 0,
    allowPrivateHosts: true,
    logLevel: 'error',
    demoEncodeDelayMs: 0,
  });
  const { app, services } = createApp({ config });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  ctx = {
    baseUrl,
    async close() {
      await services?.shutdown?.().catch(() => {});
      await new Promise((r) => server.close(r));
    },
  };

  await check('server', 'boots and answers /api/health', async () => {
    const { status, json } = await jsonFetch(`${baseUrl}/api/health`);
    if (status !== 200) throw new Error(`HTTP ${status}`);
    if (json.status !== 'ok') throw new Error(`status=${json.status}`);
    return `mode=${json.mode} · uptime=${json.uptime}s`;
  });

  if (!demoOnly) {
    await check('server', 'both engines reported available', async () => {
      const { json } = await jsonFetch(`${baseUrl}/api/health`);
      const ffmpegOk = json.engines?.ffmpeg?.available;
      const ytdlpOk = json.engines?.ytdlp?.available;
      if (!ffmpegOk || !ytdlpOk) throw new Error(`ffmpeg=${ffmpegOk} ytdlp=${ytdlpOk}`);
      return `yt-dlp ${json.engines.ytdlp.version}`;
    });
  }

  /* 3. media source --------------------------------------------------- */
  let mediaUrl = 'https://www.youtube.com/watch?v=demoBukkTub';
  if (!demoOnly) {
    const file = path.join(workDir, 'origin-sample.mp4');
    await check('media', 'generates a 480p sample clip with ffmpeg', async () => {
      await generateSampleVideo(file, { seconds: 4, height: 480, fps: 15 });
      const info = await probeMedia(file);
      if (!info.video.length || !info.audio.length) throw new Error('sample has no video+audio streams');
      return `${info.video[0].width}x${info.video[0].height} · ${info.duration.toFixed(1)}s`;
    });

    const bytes = await fs.readFile(file);
    origin = http.createServer((req, res) => {
      const range = req.headers.range;
      if (req.url === '/sample.mp4' && range) {
        const [startRaw, endRaw] = range.replace('bytes=', '').split('-');
        const start = Number(startRaw) || 0;
        const end = endRaw ? Number(endRaw) : bytes.length - 1;
        res.writeHead(206, {
          'content-type': 'video/mp4',
          'content-range': `bytes ${start}-${end}/${bytes.length}`,
          'accept-ranges': 'bytes',
        });
        return res.end(bytes.subarray(start, end + 1));
      }
      if (req.url === '/sample.mp4') {
        res.writeHead(200, { 'content-type': 'video/mp4', 'content-length': bytes.length, 'accept-ranges': 'bytes' });
        return res.end(bytes);
      }
      res.writeHead(404).end('not found');
    });
    await new Promise((r) => origin.listen(0, '127.0.0.1', r));
    mediaUrl = `http://127.0.0.1:${origin.address().port}/sample.mp4`;
    await check('media', 'serves the sample over HTTP with byte ranges', async () => {
      const res = await fetch(mediaUrl, { headers: { range: 'bytes=0-1023' } });
      if (res.status !== 206) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      return `${buf.length} bytes · ${res.headers.get('content-range')}`;
    });
  }

  /* 4. metadata ------------------------------------------------------- */
  let info = null;
  await check('pipeline', 'POST /api/info returns metadata + formats', async () => {
    const { status, json } = await jsonFetch(`${baseUrl}/api/info`, { method: 'POST', body: { url: mediaUrl } });
    if (status !== 200) throw new Error(`HTTP ${status}: ${json?.error?.code ?? ''}`);
    info = json;
    const count = (json.formats?.video?.length ?? 0) + (json.formats?.combined?.length ?? 0);
    if (!json.video?.title) throw new Error('no title');
    if (count === 0) throw new Error('no formats in catalogue');
    return `"${json.video.title.slice(0, 40)}" · ${count} video formats · ${json.formats.audio.length} audio`;
  });

  /* 5. download a video (audio merged) -------------------------------- */
  await check('pipeline', 'video job downloads and muxes audio', async () => {
    const { status, json } = await jsonFetch(`${baseUrl}/api/jobs`, {
      method: 'POST',
      body: { url: mediaUrl, preset: 'best', title: 'Verify Clip' },
    });
    if (status !== 201) throw new Error(`HTTP ${status}: ${json?.error?.code ?? ''}`);
    const job = await waitForJob(baseUrl, json.job.id);
    if (job.status !== 'ready') throw new Error(`${job.status}: ${job.error?.code ?? ''} ${job.error?.message ?? ''}`);
    const res = await fetch(`${baseUrl}${job.fileUrl}`);
    if (!res.ok) throw new Error(`file HTTP ${res.status}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    const file = path.join(workDir, `out-${job.id}.mp4`);
    await fs.writeFile(file, bytes);
    const probed = await probeMedia(file);
    if (!probed.video.length || !probed.audio.length) throw new Error('result is missing a video or audio stream');
    return `${job.filename} · ${(bytes.length / 1024).toFixed(0)} KB · ${probed.video[0].codec}+${probed.audio[0].codec} · ${probed.video[0].width}x${probed.video[0].height}`;
  });

  /* 6. audio-only ----------------------------------------------------- */
  await check('pipeline', 'MP3 preset produces playable audio', async () => {
    const { status, json } = await jsonFetch(`${baseUrl}/api/jobs`, {
      method: 'POST',
      body: { url: mediaUrl, preset: 'mp3-320', title: 'Verify Audio' },
    });
    if (status !== 201) throw new Error(`HTTP ${status}: ${json?.error?.code ?? ''}`);
    const job = await waitForJob(baseUrl, json.job.id);
    if (job.status !== 'ready') throw new Error(`${job.status}: ${job.error?.code ?? ''} ${job.error?.message ?? ''}`);
    const res = await fetch(`${baseUrl}${job.fileUrl}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    const file = path.join(workDir, `out-${job.id}.mp3`);
    await fs.writeFile(file, bytes);
    const probed = await probeMedia(file);
    if (!probed.audio.length) throw new Error('no audio stream');
    return `${job.filename} · ${(bytes.length / 1024).toFixed(0)} KB · ${probed.audio[0].codec} ${probed.audio[0].bit_rate ? `${Math.round(probed.audio[0].bit_rate / 1000)} kbps` : ''}`;
  });

  /* 7. HTTP surface --------------------------------------------------- */
  await check('http', 'file endpoint honours Range (206 + Content-Range)', async () => {
    const { json } = await jsonFetch(`${baseUrl}/api/jobs`, {
      method: 'POST',
      body: { url: mediaUrl, preset: 'mp4-480', title: 'Verify Range' },
    });
    const job = await waitForJob(baseUrl, json.job.id);
    if (job.status !== 'ready') throw new Error(`job ${job.status}`);
    const res = await fetch(`${baseUrl}${job.fileUrl}`, { headers: { range: 'bytes=0-2047' } });
    if (res.status !== 206) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    return `${buf.length} bytes · ${res.headers.get('content-range')}`;
  });

  await check('http', 'SSE endpoint streams a hello frame', async () => {
    const controller = new AbortController();
    const res = await fetch(`${baseUrl}/api/events`, { signal: controller.signal });
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let text = '';
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline && !text.includes('event:')) {
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
    }
    controller.abort();
    const event = text.match(/event:\s*(\S+)/)?.[1];
    if (!event) throw new Error('no SSE frame received');
    return `event: ${event}`;
  });

  await check('http', 'OpenAPI document is served and valid', async () => {
    const { status, json } = await jsonFetch(`${baseUrl}/api/openapi.json`);
    if (status !== 200) throw new Error(`HTTP ${status}`);
    if (!json?.openapi?.startsWith('3.')) throw new Error(`openapi=${json?.openapi}`);
    return `openapi ${json.openapi} · ${Object.keys(json.paths ?? {}).length} paths`;
  });

  await check('http', 'typed error envelope for a bad URL', async () => {
    const { status, json } = await jsonFetch(`${baseUrl}/api/jobs`, {
      method: 'POST',
      body: { url: 'not-a-url', preset: 'mp4-1080' },
    });
    if (status !== 400) throw new Error(`HTTP ${status}`);
    if (!json?.error?.code) throw new Error('no error code');
    return `${status} ${json.error.code}`;
  });

  await check('http', 'rejects unsafe paths (no traversal)', async () => {
    const res = await fetch(`${baseUrl}/api/files/..%2F..%2Fpackage.json`);
    if (res.status === 200) throw new Error('traversal served a file');
    return `HTTP ${res.status}`;
  });

  /* 8. static app ----------------------------------------------------- */
  await check('app', 'serves the built SPA (npm run build)', async () => {
    const res = await fetch(`${baseUrl}/`);
    const html = await res.text();
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    if (!html.includes('id="root"') && !html.includes('id="seo-shell"')) throw new Error('index.html has no app mount point');
    return `${(html.length / 1024).toFixed(0)} KB html · ${/assets\/index-[\w-]+\.js/.test(html) ? 'bundled assets' : 'dev shell'}`;
  });

  await check('app', 'robots.txt and the web manifest are reachable', async () => {
    const robots = await fetch(`${baseUrl}/robots.txt`);
    const manifest = await fetch(`${baseUrl}/manifest.webmanifest`);
    if (!robots.ok || !manifest.ok) throw new Error(`robots=${robots.status} manifest=${manifest.status}`);
    const parsed = await manifest.json();
    if (parsed.display !== 'standalone') throw new Error('manifest is not standalone');
    return `${manifest.status} manifest · ${parsed.icons.length} icons`;
  });
} catch (err) {
  failures += 1;
  console.error(`\nfatal: ${err?.stack || err}`);
} finally {
  await ctx?.close?.();
  await new Promise((r) => (origin ? origin.close(r) : r()));
  if (workDir) await fs.rm(workDir, { recursive: true, force: true });
}

const passed = results.filter((r) => r.ok).length;
const total = results.length;
console.log(`\n${passed}/${total} checks passed in ${((Date.now() - started) / 1000).toFixed(1)}s`);
if (failures) {
  console.log('Failed checks:');
  for (const r of results.filter((x) => !x.ok)) console.log(`  ✗ ${r.name} → ${r.detail}`);
  console.log('\nFix the items above (usually `npm run setup` + `npm run build`) and re-run `npm run verify`.');
  process.exit(1);
}
console.log('Everything works. Start the app with `npm start` (or `npm run dev`).');
process.exit(0);
