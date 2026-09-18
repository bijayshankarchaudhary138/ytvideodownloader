/**
 * yt-dlp integration: argument building (argv only — never a shell string),
 * progress parsing, friendly error mapping, availability checks.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { humanBytes } from './util.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..', '..', '..');

export const PROGRESS_PREFIX = '__PROGRESS__';

export function resolveVendorDir() {
  return process.env.VENDOR_DIR || path.join(ROOT_DIR, 'vendor');
}

function pythonCandidates() {
  return [process.env.PYTHON_BIN, 'python3', 'python'].filter(Boolean);
}

/**
 * Directory that must be on PYTHONPATH so that `import yt_dlp` works
 * (i.e. the *parent* of the yt_dlp package). null when not installed.
 */
export function ytdlpModulePath() {
  const vendor = resolveVendorDir();
  try {
    fs.accessSync(path.join(vendor, 'yt_dlp', '__init__.py'));
    return vendor;
  } catch {
    return null;
  }
}

let versionCache = null;

export async function ytdlpVersion({ force = false } = {}) {
  if (versionCache && !force) return versionCache.version;
  const modulePath = ytdlpModulePath();
  const env = { ...process.env };
  if (modulePath) env.PYTHONPATH = [modulePath, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter);

  for (const bin of pythonCandidates()) {
    const version = await new Promise((resolve) => {
      let child;
      try {
        child = spawn(bin, ['-m', 'yt_dlp', '--version'], { env, stdio: ['ignore', 'pipe', 'ignore'] });
      } catch { resolve(null); return; }
      let out = '';
      child.stdout.on('data', (d) => { out += d; });
      child.on('error', () => resolve(null));
      child.on('close', (code) => resolve(code === 0 ? out.trim() : null));
    });
    if (version) {
      versionCache = { bin, version, modulePath, env };
      return version;
    }
  }
  return null;
}

export async function ytdlpAvailable() {
  return Boolean(await ytdlpVersion());
}

/** Info about how to invoke yt-dlp, or null when unavailable. */
export async function ytdlpRuntime() {
  const version = await ytdlpVersion();
  if (!version || !versionCache) return null;
  return {
    bin: versionCache.bin,
    version,
    modulePath: versionCache.modulePath,
    env: versionCache.env,
  };
}

/* ------------------------------------------------------------------ *
 * Argument building
 * ------------------------------------------------------------------ */
// Only these extra flags may be forwarded from configuration — everything else
// (especially --exec) is dropped so a mis-configured host cannot run commands.
const SAFE_EXTRA_ARGS = new Set([
  '--geo-bypass', '--no-check-certificates', '--force-ipv4', '--force-ipv6',
  '--extractor-args', '--user-agent', '--referer', '--sleep-interval',
  '--max-sleep-interval', '--no-cache-dir', '--compat-options',
]);

function formatSectionTime(seconds) {
  const s = Math.max(0, Number(seconds) || 0);
  const hh = String(Math.floor(s / 3600)).padStart(2, '0');
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(Math.floor(s % 60)).padStart(2, '0');
  const ms = String(Math.round((s - Math.floor(s)) * 1000)).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}

/** yt-dlp progress template: pipe-delimited so missing values stay parseable. */
function progressTemplate() {
  return [
    PROGRESS_PREFIX,
    '%(progress.status)s',
    '%(progress.downloaded_bytes)s',
    '%(progress.total_bytes)s',
    '%(progress.total_bytes_estimate)s',
    '%(progress.speed)s',
    '%(progress.eta)s',
    '%(progress.fragment_index)s',
    '%(progress.fragment_count)s',
  ].join('|');
}

/**
 * @returns {string[]} argv for python -m yt_dlp (the URL is always last)
 */
export function buildYtDlpArgs({
  url,
  outputTemplate,
  ffmpegLocation,
  format = 'best',
  mergeFormat,
  writeInfoJson = false,
  writeThumbnail = false,
  embedThumbnail = false,
  embedMetadata = false,
  writeSubs = false,
  writeAutoSubs = false,
  subLangs = [],
  subFormat = 'srt',
  extractAudio = false,
  audioFormat,
  audioQuality,
  trim = null,
  playlist = false,
  playlistItems = null,
  cookiesFile = null,
  extractorArgs = null,
  rateLimit = null,
  concurrentFragments = null,
  proxyUrl = null,
  socketTimeout = 20,
  retries = 5,
  fragmentRetries = 5,
  timeoutMs = null,
  ffmpegPreset = null,
  skipDownload = false,
  extraArgs = [],
} = {}) {
  const args = [
    '--newline',
    '--no-colors',
    '--no-warnings',
    '--no-cache-dir',
    '--ignore-config',
    '--socket-timeout', String(socketTimeout),
    '--retries', String(retries),
    '--fragment-retries', String(fragmentRetries),
    '--progress-template', progressTemplate(),
  ];

  if (playlist) {
    args.push('--yes-playlist', '--ignore-errors');
    if (playlistItems) args.push('--playlist-items', String(playlistItems));
  } else {
    args.push('--no-playlist');
  }

  if (skipDownload) args.push('--skip-download');
  if (outputTemplate) args.push('-o', outputTemplate);
  if (ffmpegLocation) args.push('--ffmpeg-location', ffmpegLocation);
  else if (ffmpegPreset) args.push('--postprocessor-args', `ffmpeg:-preset ${ffmpegPreset}`);

  args.push('-f', String(format));
  if (mergeFormat) args.push('--merge-output-format', mergeFormat);

  if (writeInfoJson) args.push('--write-info-json', '--no-clean-info-json');
  if (writeThumbnail) args.push('--write-thumbnail', '--convert-thumbnails', 'jpg');
  if (embedThumbnail) args.push('--embed-thumbnail');
  // Embedding cover art without metadata is sloppy: keep title/artist in the file.
  if (embedMetadata || embedThumbnail) args.push('--embed-metadata');
  if (writeSubs) args.push('--write-subs');
  if (writeAutoSubs) args.push('--write-auto-subs');
  if (writeSubs || writeAutoSubs) {
    if (subLangs.length) args.push('--sub-langs', subLangs.join(','));
    if (subFormat) args.push('--convert-subs', subFormat);
  }
  if (extractAudio) {
    args.push('-x');
    if (audioFormat) args.push('--audio-format', audioFormat);
    if (audioQuality) args.push('--audio-quality', audioQuality);
  }
  if (trim && Number.isFinite(trim.start) && Number.isFinite(trim.end)) {
    args.push('--download-sections', `*${formatSectionTime(trim.start)}-${formatSectionTime(trim.end)}`, '--force-keyframes-at-cuts');
  }
  if (cookiesFile) args.push('--cookies', cookiesFile);
  // Workaround lever for YouTube changes/blocks: "youtube:player_client=web_safari,tv"
  // (multiple values separated by ';'). Never passed from user input.
  if (extractorArgs) {
    for (const value of String(extractorArgs).split(';').map((v) => v.trim()).filter(Boolean).slice(0, 4)) {
      args.push('--extractor-args', value);
    }
  }
  if (rateLimit) args.push('--limit-rate', String(rateLimit));
  if (concurrentFragments) args.push('--concurrent-fragments', String(concurrentFragments));
  if (proxyUrl) args.push('--proxy', proxyUrl);
  if (timeoutMs) args.push('--socket-timeout', String(Math.max(1, Math.round(timeoutMs / 1000))));

  for (const extra of Array.isArray(extraArgs) ? extraArgs : []) {
    if (typeof extra === 'string' && SAFE_EXTRA_ARGS.has(extra)) args.push(extra);
  }

  args.push(String(url));
  return args;
}

/**
 * Spawn yt-dlp, streaming merged stdout/stderr lines to `onLine`.
 * Rejects with a typed error ({code}) on failure.
 */
export async function runYtDlp(args, { env = {}, onLine, timeoutMs = 20 * 60_000, signal } = {}) {
  const runtime = await ytdlpRuntime();
  if (!runtime) {
    const err = new Error('yt-dlp is not installed on this server.');
    err.code = 'ENGINE_UNAVAILABLE';
    throw err;
  }
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(runtime.bin, ['-m', 'yt_dlp', ...args], {
        env: { ...runtime.env, ...env },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch (err) {
      reject(Object.assign(new Error(err.message), { code: 'ENGINE_UNAVAILABLE' }));
      return;
    }

    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      child.kill('SIGKILL');
      settled = true;
      reject(Object.assign(new Error('download timed out'), { code: 'TIMEOUT' }));
    }, timeoutMs);

    const onAbort = () => { child.kill('SIGKILL'); };
    signal?.addEventListener('abort', onAbort, { once: true });

    const feed = (chunk) => {
      const text = chunk.toString();
      stdout += text;
      if (onLine) for (const line of text.split(/\r?\n/)) if (line.trim()) onLine(line.trim());
    };

    child.stdout.on('data', feed);
    child.stderr.on('data', (d) => {
      const text = d.toString();
      stderr += text;
      if (onLine) for (const line of text.split(/\r?\n/)) if (line.trim()) onLine(line.trim());
    });
    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(Object.assign(new Error(err.message), { code: 'ENGINE_UNAVAILABLE' }));
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      if (code === 0) resolve({ stdout, stderr, code });
      else {
        const parsed = parseYtdlpError(stderr || stdout);
        reject(Object.assign(new Error(parsed.message), { code: parsed.code, details: parsed.details }));
      }
    });
  });
}

/* ------------------------------------------------------------------ *
 * Progress + output parsing
 * ------------------------------------------------------------------ */
const UNITS = { b: 1, kb: 1024, kib: 1024, mb: 1024 ** 2, mib: 1024 ** 2, gb: 1024 ** 3, gib: 1024 ** 3 };

function sizeToBytes(amount, unit) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return null;
  const mult = UNITS[String(unit).toLowerCase()];
  return mult ? Math.round(n * mult) : null;
}

const clampPercent = (p) => Math.max(0, Math.min(100, Math.round(p * 10) / 10));

/**
 * Parse one yt-dlp output line into a progress update (or null).
 * Supports both the machine-readable template and the human-readable default.
 */
export function parseYtdlpProgressLine(line) {
  const text = String(line ?? '').trim();
  if (!text) return null;

  if (text.startsWith(PROGRESS_PREFIX)) {
    const payload = text.slice(PROGRESS_PREFIX.length);
    let fields;
    if (payload.startsWith('{')) {
      try {
        const j = JSON.parse(payload);
        fields = [j.status, j.downloaded_bytes, j.total_bytes, j.total_bytes_estimate, j.speed, j.eta, j.fragment_index, j.fragment_count];
      } catch { return null; }
    } else {
      fields = payload.split('|');
    }
    const [status, downloadedRaw, totalRaw, totalEstRaw, speedRaw, etaRaw, fragIndex, fragCount] = fields;
    const num = (v) => {
      if (v === null || v === undefined) return null;
      const s = String(v).trim();
      if (!s || s === 'NA' || s === 'None' || s === 'null' || s === 'undefined') return null;
      const n = Number(s);
      return Number.isFinite(n) ? n : null;
    };
    const downloaded = num(downloadedRaw);
    const total = num(totalRaw) ?? num(totalEstRaw);
    const out = {
      stage: status === 'finished' ? 'processing' : 'downloading',
      downloaded,
      total,
      totalBytes: total,
      speedBytesPerSec: num(speedRaw),
      eta: num(etaRaw),
      fragmentIndex: num(fragIndex),
      fragmentCount: num(fragCount),
    };
    if (downloaded != null && total) out.percent = clampPercent((downloaded / total) * 100);
    else if (status === 'finished') out.percent = 100;
    out.speed = out.speedBytesPerSec ? `${humanBytes(out.speedBytesPerSec)}/s` : null;
    return out;
  }

  const dl = text.match(/^\[download\]\s+(-?[\d.]+)%\s+of\s+~?\s*([\d.]+)\s*([KMGT]?i?B)(?:\s+at\s+([\d.]+\s*[KMGT]?i?B\/s))?(?:\s+ETA\s+([\d:]+))?/i);
  if (dl) {
    const percent = clampPercent(Number(dl[1]));
    const totalBytes = sizeToBytes(dl[2], dl[3]);
    const speed = dl[4]?.replace(/\s+/g, '') ?? null;
    return {
      stage: 'downloading',
      percent,
      total: totalBytes,
      totalBytes,
      downloaded: totalBytes ? Math.round((percent / 100) * totalBytes) : null,
      speed,
      eta: dl[5] ? parseClock(dl[5]) : null,
    };
  }
  const finished = text.match(/^\[download\]\s+100% of\s+~?\s*([\d.]+)\s*([KMGT]?i?B)(?:\s+in\s+([\d:]+))?/i);
  if (finished) {
    return { stage: 'processing', percent: 100, total: sizeToBytes(finished[1], finished[2]), speed: null, eta: 0 };
  }
  return null;
}

function parseClock(value) {
  const parts = String(value).split(':').map(Number);
  if (parts.some((n) => !Number.isFinite(n))) return null;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

export function detectStage(line) {
  const text = String(line ?? '');
  if (/^\[download\]\s+Destination:/.test(text)) return 'downloading';
  if (/\[Merger\]/.test(text)) return 'merging';
  if (/\[ExtractAudio\]|\[VideoConvertor\]|\[FFmpegThumbnailsConvertor\]/.test(text)) return 'converting';
  if (/Deleting original file|\[FixupM4a\]|\[Fixup\w+\]|\[Metadata\]|\[EmbedThumbnail\]/.test(text)) return 'finalizing';
  return null;
}

/** Map raw yt-dlp failures to friendly, typed, path-free errors. */
export function parseYtdlpError(raw) {
  const text = String(raw ?? '');
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const errorLine = [...lines].reverse().find((l) => /^ERROR:/.test(l)) ?? lines.at(-1) ?? 'download failed';
  let message = errorLine.replace(/^ERROR:\s*/i, '').trim();

  const patterns = [
    [/sign in to confirm|confirm you'?re not a bot|bot check/i, 'BOT_CHECK', 'YouTube asked for a sign-in check. Please try again in a few minutes.'],
    [/private video|this video is private/i, 'PRIVATE_VIDEO', 'This video is private.'],
    // specific causes must be checked before the generic "not available"
    [/not available in your country|geo[- ]?restrict|blocked in your country|available in your country/i, 'GEO_BLOCKED', 'This video is blocked in the server region.'],
    [/requested format (is )?not available|no video formats found|requested format/i, 'FORMAT_UNAVAILABLE', 'The requested quality is not available for this video.'],
    [/video unavailable|is not available|removed by the uploader|no longer available/i, 'VIDEO_UNAVAILABLE', 'This video is unavailable or has been removed.'],
    [/http error 429|too many requests|rate.?limit/i, 'RATE_LIMITED', 'YouTube rate-limited this server. Please try again later.'],
    [/unsupported url/i, 'UNSUPPORTED_URL', 'This site is not supported.'],
    [/this live event|premieres in|not started/i, 'VIDEO_UNAVAILABLE', 'This live stream has not started yet.'],
    [/timed out|timeout/i, 'TIMEOUT', 'The download timed out. Please try again.'],
  ];

  for (const [re, code, friendly] of patterns) {
    if (re.test(message)) return { code, message: friendly };
  }
  return {
    code: 'DOWNLOAD_FAILED',
    message: sanitize(message) || 'The download failed. Please try again.',
  };
}

/** Remove absolute paths / tracebacks / urls with credentials from messages. */
function sanitize(message) {
  return String(message)
    .replace(/Traceback[\s\S]*/i, '')
    .replace(/\[download\]\s*/gi, '')
    .replace(/(?:\/[\w.\-]+){2,}/g, '[path]')
    .replace(/https?:\/\/[^\s]*@/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
}

/** Find the produced file in a working directory (largest media file wins). */
export async function findOutputFile(dir, { extensions = ['mp4', 'mkv', 'webm', 'mp3', 'm4a', 'opus', 'wav', 'flac', 'srt', 'vtt', 'jpg', 'json'] } = {}) {
  const fsMod = await import('node:fs/promises');
  const entries = await fsMod.readdir(dir, { withFileTypes: true }).catch(() => []);
  const candidates = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).slice(1).toLowerCase();
    if (!extensions.includes(ext)) continue;
    if (/\.info\.json$/.test(entry.name)) continue;
    const full = path.join(dir, entry.name);
    const stat = await fsMod.stat(full).catch(() => null);
    if (stat) candidates.push({ file: full, name: entry.name, size: stat.size, ext });
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.size - a.size);
  return candidates[0];
}
