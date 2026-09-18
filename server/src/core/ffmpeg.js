/**
 * ffmpeg / ffprobe wrapper.
 *
 * Notes on this environment: the PyPI `imageio-ffmpeg` wheel ships a static
 * ffmpeg but *not* an ffprobe. If a real ffprobe is available (PATH or
 * FFPROBE_PATH) we use it; otherwise we derive the same information from
 * `ffmpeg -i <file>` (instant — it does not decode, it just prints headers).
 */
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..', '..', '..');

let cachedFfmpeg = null;
let cachedFfprobe = undefined; // undefined = not probed yet, null = none found

export function resolveVendorDir() {
  return process.env.VENDOR_DIR || path.join(ROOT_DIR, 'vendor');
}

export function ffmpegBin() {
  if (cachedFfmpeg) return cachedFfmpeg;
  const candidates = [
    process.env.FFMPEG_PATH,
    path.join(resolveVendorDir(), 'bin', 'ffmpeg'),
    path.join(ROOT_DIR, 'vendor', 'bin', 'ffmpeg'),
    '/usr/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      cachedFfmpeg = candidate;
      return cachedFfmpeg;
    } catch { /* keep looking */ }
  }
  cachedFfmpeg = 'ffmpeg'; // rely on PATH
  return cachedFfmpeg;
}

/**
 * A genuine ffprobe binary, or null.
 * Validation is a real `ffprobe -version` call: a renamed copy of ffmpeg (a
 * mistake people commonly make) deliberately does not count as ffprobe.
 */
export function ffprobeBin() {
  if (cachedFfprobe !== undefined) return cachedFfprobe;
  const candidates = [
    process.env.FFPROBE_PATH,
    '/usr/bin/ffprobe',
    '/usr/local/bin/ffprobe',
    '/opt/homebrew/bin/ffprobe',
    path.join(resolveVendorDir(), 'bin', 'ffprobe'),
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      const out = execFileSync(candidate, ['-version'], { timeout: 10_000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      if (out.startsWith('ffprobe version')) {
        cachedFfprobe = candidate;
        return cachedFfprobe;
      }
    } catch { /* keep looking */ }
  }
  cachedFfprobe = null;
  return cachedFfprobe;
}

/* ------------------------------------------------------------------ *
 * Process helpers
 * ------------------------------------------------------------------ */
function spawnCapture(bin, args, { timeoutMs = 0, onStderr, signal } = {}) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    } catch (err) {
      reject(Object.assign(new Error(`failed to spawn ${bin}: ${err.message}`), { code: 'FFMPEG_FAILED' }));
      return;
    }
    let stdout = '';
    let stderr = '';
    let settled = false;
    const cleanup = () => {
      if (timer) clearTimeout(timer);
      signal?.removeEventListener?.('abort', onAbort);
    };
    const timer = timeoutMs
      ? setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        child.kill('SIGKILL');
        reject(Object.assign(new Error(`ffmpeg timed out after ${timeoutMs}ms`), { code: 'FFMPEG_FAILED' }));
      }, timeoutMs)
      : null;

    function onAbort() {
      if (settled) return;
      settled = true;
      cleanup();
      child.kill('SIGKILL');
      reject(Object.assign(new Error('aborted'), { code: 'ABORTED' }));
    }
    if (signal) {
      if (signal.aborted) { onAbort(); return; }
      signal.addEventListener('abort', onAbort, { once: true });
    }

    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => {
      stderr += d;
      if (onStderr) onStderr(d.toString());
    });
    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(Object.assign(new Error(`ffmpeg error: ${err.message}`), { code: 'FFMPEG_FAILED' }));
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}

/**
 * Run ffmpeg. Rejects with `{code:'FFMPEG_FAILED'}` on a non-zero exit unless
 * `allowError` is set (probing intentionally exits non-zero).
 */
export async function runFfmpeg(args, { timeoutMs = 0, onStderr, allowError = false, signal } = {}) {
  const res = await spawnCapture(ffmpegBin(), args, { timeoutMs, onStderr, signal });
  if (res.code !== 0 && !allowError) {
    const err = new Error(cleanFfmpegError(res.stderr));
    err.code = 'FFMPEG_FAILED';
    err.exitCode = res.code;
    err.stderr = res.stderr.slice(-4000);
    throw err;
  }
  return res;
}

function cleanFfmpegError(stderr) {
  const lines = String(stderr ?? '').trim().split('\n').filter(Boolean);
  const useful = lines.filter((l) => /error|invalid|unable|no such|failed|could not/i.test(l));
  const picked = (useful.at(-1) || lines.at(-1) || 'ffmpeg failed').trim();
  return picked.replace(/(?:\/[\w.\-]+){2,}/g, '[path]').slice(0, 300);
}

/* ------------------------------------------------------------------ *
 * Probing
 * ------------------------------------------------------------------ */
export function parseFfmpegProbeText(text) {
  const streams = [];
  const format = {};
  const input = text.match(/Input #0,\s*([^,]+(?:,[^,]+)*),\s*from '([^']+)'/);
  if (input) {
    format.format_name = input[1].trim();
    format.filename = input[2];
  }
  const dur = text.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (dur) format.duration = Number(dur[1]) * 3600 + Number(dur[2]) * 60 + parseFloat(dur[3]);
  const br = text.match(/bitrate:\s*(\d+)\s*kb\/s/);
  if (br) format.bit_rate = String(Number(br[1]) * 1000);

  const blocks = text.split(/\n\s*Stream #/).slice(1);
  for (const [i, block] of blocks.entries()) {
    const header = block.split('\n')[0];
    const type = header.match(/:\s*(Video|Audio|Subtitle|Data|Attachment):/)?.[1]?.toLowerCase();
    if (!type) continue;
    const stream = {
      index: i,
      codec_type: type,
      codec_name: header.match(/(?:Video|Audio|Subtitle|Data|Attachment):\s*([A-Za-z0-9_]+)/)?.[1] ?? null,
    };
    const res = header.match(/(\d{2,5})x(\d{2,5})/);
    if (res && type === 'video') {
      stream.width = Number(res[1]);
      stream.height = Number(res[2]);
    }
    const kbps = [...header.matchAll(/(\d+)\s*kb\/s/g)];
    if (kbps.length) stream.bit_rate = String(Number(kbps.at(-1)[1]) * 1000);
    const hz = header.match(/(\d{3,6})\s*Hz/);
    if (hz) stream.sample_rate = String(Number(hz[1]));
    const ch = header.match(/,\s*(mono|stereo|[0-9]\.[0-9])\s*,/);
    if (ch) stream.channels = ch[1] === 'mono' ? 1 : ch[1] === 'stereo' ? 2 : Number(ch[1][0]) + 1;
    const fps = header.match(/([\d.]+)\s*fps/);
    if (fps) stream.r_frame_rate = `${Math.round(Number(fps[1]))}/1`;
    streams.push(stream);
  }
  return { streams, format };
}

/** ffprobe-compatible JSON, using a real ffprobe when available. */
export async function ffprobe(file, { timeoutMs = 30_000 } = {}) {
  const real = ffprobeBin();
  if (real) {
    const res = await spawnCapture(real, ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', file], { timeoutMs });
    if (res.code === 0 && res.stdout.trim().startsWith('{')) {
      try { return JSON.parse(res.stdout); } catch { /* fall through */ }
    }
  }
  const res = await runFfmpeg(['-hide_banner', '-i', file], { timeoutMs, allowError: true });
  const parsed = parseFfmpegProbeText(`${res.stderr}\n${res.stdout}`);
  if (!parsed.format.duration && !parsed.streams.length) {
    const err = new Error('could not read media info');
    err.code = 'FFMPEG_FAILED';
    throw err;
  }
  return parsed;
}

export async function probeMedia(file, opts) {
  const info = await ffprobe(file, opts);
  const videos = (info.streams ?? []).filter((s) => s.codec_type === 'video' && s.codec_name !== 'mjpeg');
  const audios = (info.streams ?? []).filter((s) => s.codec_type === 'audio');
  let size = 0;
  try { size = (await fsp.stat(file)).size; } catch { /* ignore */ }
  return {
    container: info.format?.format_name ?? null,
    duration: Number(info.format?.duration ?? 0),
    bitRate: Number(info.format?.bit_rate ?? 0) || null,
    size,
    video: videos.map((s) => ({
      codec: s.codec_name,
      width: s.width ?? null,
      height: s.height ?? null,
      bit_rate: Number(s.bit_rate ?? 0) || null,
      fps: parseFps(s.r_frame_rate),
    })),
    audio: audios.map((s) => ({
      codec: s.codec_name,
      bit_rate: Number(s.bit_rate ?? 0) || null,
      sample_rate: Number(s.sample_rate ?? 0) || null,
      channels: s.channels ?? null,
    })),
  };
}

function parseFps(rate) {
  if (!rate) return null;
  const [num, den] = String(rate).split('/').map(Number);
  if (!den) return num || null;
  return Math.round((num / den) * 100) / 100;
}

/* ------------------------------------------------------------------ *
 * Generators (used by the demo provider and by tests)
 * ------------------------------------------------------------------ */
/**
 * Generate a short H.264 + AAC clip.
 *
 * Deliberately uses only filters that every ffmpeg build ships: static builds
 * (including the one we bundle) frequently have no libfreetype, so `drawtext`
 * is not available and must not be required for the demo pipeline to work.
 */
export async function generateSampleVideo(file, { seconds = 5, height = 720, fps = 24, tone = 440 } = {}) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const width = Math.round((height * 16) / 9 / 2) * 2;
  const args = [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', `testsrc2=size=${width}x${height}:rate=${fps}:duration=${seconds}`,
    '-f', 'lavfi', '-i', `sine=frequency=${tone}:duration=${seconds}`,
    '-c:v', 'libx264', '-preset', process.env.FFMPEG_PRESET || 'veryfast', '-pix_fmt', 'yuv420p', '-g', String(Math.max(1, fps * 2)),
    '-c:a', 'aac', '-b:a', '128k', '-ac', '2',
    '-movflags', '+faststart',
    '-shortest',
    file,
  ];
  await runFfmpeg(args, { timeoutMs: 5 * 60_000 });
  return file;
}

/* ------------------------------------------------------------------ *
 * Progress parsing
 * ------------------------------------------------------------------ */
export function parseProgressLine(chunk, { duration = 0 } = {}) {
  const text = String(chunk ?? '');
  const out = {};
  const get = (key) => text.match(new RegExp(`${key}=([^\\n\\r]+)`))?.[1]?.trim() ?? null;

  const outTimeUs = get('out_time_ms') ?? get('out_time_us');
  if (outTimeUs && Number(outTimeUs) >= 0) out.seconds = Number(outTimeUs) / 1_000_000;
  const outTime = get('out_time');
  if (!out.seconds && outTime) out.seconds = parseClock(outTime);
  if (out.seconds != null && duration > 0) {
    out.percent = Math.max(0, Math.min(100, Math.round((out.seconds / duration) * 1000) / 10));
  }
  const speed = get('speed');
  if (speed && speed !== 'N/A') out.speed = speed;
  const total = get('total_size');
  if (total && Number(total) > 0) out.totalBytes = Number(total);
  out.done = get('progress') === 'end';
  return out;
}

function parseClock(value) {
  const m = String(value).match(/(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/);
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + parseFloat(m[3]);
}
