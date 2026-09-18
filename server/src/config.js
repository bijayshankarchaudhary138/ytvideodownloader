/**
 * Central configuration. Every knob is overridable by env var *and* by an
 * explicit override object (used heavily by the test-suite).
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(__dirname, '..', '..');

function readPackageVersion() {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8')).version || '1.0.0';
  } catch {
    return '1.0.0';
  }
}

const bool = (v, dflt = false) => {
  if (v === undefined || v === null || v === '') return dflt;
  return ['1', 'true', 'on', 'yes'].includes(String(v).toLowerCase());
};
const num = (v, dflt) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : dflt;
};

/** File lifetime: explicit ms > FILE_TTL_HOURS env > default 6 h. */
function pickTtl(overrides, env) {
  const explicit = overrides.fileTtlMs ?? overrides.ttlMs;
  if (explicit !== undefined && explicit !== null) return num(explicit, 6 * 3600_000);
  if (env.FILE_TTL_HOURS) return num(env.FILE_TTL_HOURS, 6) * 3600_000;
  return 6 * 3600_000;
}

/** Verification tokens are pasted from a dashboard: keep them short and safe. */
function token(value) {
  if (!value) return null;
  const clean = String(value).trim();
  return /^[A-Za-z0-9_\-.=]{8,120}$/.test(clean) ? clean : null;
}

/** Public origin, or null to derive it from each request. */
function normalizeSiteUrl(value) {
  if (!value) return null;
  const raw = String(value).trim().replace(/\/+$/, '');
  return /^https?:\/\/[A-Za-z0-9.-]+(?::\d+)?$/.test(raw) ? raw : null;
}

export function loadConfig(overrides = {}) {
  const env = process.env;
  const demoRaw = overrides.demoMode ?? env.DEMO_MODE;
  const demoMode = demoRaw === undefined ? 'auto' : (['1', 'true', 'on', 'yes'].includes(String(demoRaw).toLowerCase()) ? 'on' : (['0', 'false', 'off', 'no'].includes(String(demoRaw).toLowerCase()) ? 'off' : 'auto'));

  const dataDir = overrides.dataDir ?? env.DATA_DIR ?? path.join(ROOT_DIR, 'data');
  const config = {
    version: readPackageVersion(),
    env: env.NODE_ENV || 'development',
    isProd: env.NODE_ENV === 'production',

    // server
    host: overrides.host ?? env.HOST ?? '0.0.0.0',
    port: num(overrides.port ?? env.PORT, 8080),
    trustProxy: bool(overrides.trustProxy ?? env.TRUST_PROXY, true),

    // runtime mode
    demoMode, // 'on' | 'off' | 'auto' (auto = demo when yt-dlp is unavailable)
    allowPrivateHosts: bool(overrides.allowPrivateHosts ?? env.ALLOW_PRIVATE_HOSTS, false),

    // Public origin used in canonical/hreflang/OG/sitemap output. When unset the
    // request's own origin is used, so a fresh self-hosted copy is never wrong.
    siteUrl: normalizeSiteUrl(overrides.siteUrl ?? env.SITE_URL ?? null),
    // Search-engine ownership proof, injected as <meta> into every served page:
    //   GOOGLE_SITE_VERIFICATION / BING_SITE_VERIFICATION (Bing also accepts msvalidate.01)
    siteVerification: {
      google: token(overrides.googleSiteVerification ?? env.GOOGLE_SITE_VERIFICATION),
      bing: token(overrides.bingSiteVerification ?? env.BING_SITE_VERIFICATION ?? env.MSV_VERIFICATION),
    },

    // storage
    dataDir,
    tmpDir: overrides.tmpDir ?? path.join(dataDir, 'tmp'),
    jobsDir: overrides.jobsDir ?? path.join(dataDir, 'jobs'),
    cacheDir: overrides.cacheDir ?? path.join(dataDir, 'cache'),
    webDistDir: overrides.webDistDir ?? path.join(ROOT_DIR, 'web', 'dist'),
    webPublicDir: overrides.webPublicDir ?? path.join(ROOT_DIR, 'web', 'public'),
    vendorDir: overrides.vendorDir ?? env.VENDOR_DIR ?? path.join(ROOT_DIR, 'vendor'),

    // engines
    ffmpegPath: overrides.ffmpegPath ?? env.FFMPEG_PATH ?? null,
    ffmpegPreset: overrides.ffmpegPreset ?? env.FFMPEG_PRESET ?? 'veryfast',
    ffmpegThreads: num(overrides.ffmpegThreads ?? env.FFMPEG_THREADS, 0), // 0 = auto
    cookiesFile: overrides.cookiesFile ?? env.COOKIES_FILE ?? null,
    // yt-dlp --extractor-args, e.g. "youtube:player_client=web_safari,tv".
    // Useful when YouTube starts challenging a server IP (BOT_CHECK).
    extractorArgs: overrides.extractorArgs ?? env.YTDLP_EXTRACTOR_ARGS ?? null,
    proxyUrl: overrides.proxyUrl ?? env.PROXY_URL ?? null,
    rateLimitUpstream: overrides.rateLimitUpstream ?? env.UPSTREAM_RATE_LIMIT ?? null,
    concurrentFragments: num(overrides.concurrentFragments ?? env.CONCURRENT_FRAGMENTS, 4),
    jobTimeoutMs: num(overrides.jobTimeoutMs ?? env.JOB_TIMEOUT_MS, 20 * 60 * 1000),

    // queue + limits
    concurrency: num(overrides.concurrency ?? env.CONCURRENCY, 2),
    maxQueueLength: num(overrides.maxQueueLength ?? env.MAX_QUEUE_LENGTH, 50),
    maxBatchSize: num(overrides.maxBatchSize ?? env.MAX_BATCH_SIZE, 5),
    maxPlaylistItems: num(overrides.maxPlaylistItems ?? env.MAX_PLAYLIST_ITEMS, 50),
    maxUrlsPerRequest: num(overrides.maxUrlsPerRequest ?? env.MAX_URLS_PER_REQUEST, 25),
    maxDurationSeconds: num(overrides.maxDurationSeconds ?? env.MAX_DURATION_SECONDS, 4 * 60 * 60),
    maxFilesizeBytes: num(overrides.maxFilesizeBytes ?? env.MAX_FILESIZE_BYTES, 4 * 1024 * 1024 * 1024),

    // lifecycle
    ttlMs: pickTtl(overrides, env),
    infoCacheTtlMs: num(overrides.infoCacheTtlMs ?? env.INFO_CACHE_TTL_MS, 15 * 60 * 1000),
    infoCacheMax: num(overrides.infoCacheMax ?? env.INFO_CACHE_MAX, 200),
    sweepIntervalMs: num(overrides.sweepIntervalMs ?? env.SWEEP_INTERVAL_MS, 10 * 60 * 1000),
    heartbeatMs: num(overrides.heartbeatMs ?? env.SSE_HEARTBEAT_MS, 20_000),

    // protection
    rateLimitMax: num(overrides.rateLimitMax ?? env.RATE_LIMIT_MAX, 60),
    rateLimitWindowMs: num(overrides.rateLimitWindowMs ?? env.RATE_LIMIT_WINDOW_MS, 60_000),
    heavyRateLimitMax: num(overrides.heavyRateLimitMax ?? env.HEAVY_RATE_LIMIT_MAX, 15),
    bodyLimit: overrides.bodyLimit ?? env.BODY_LIMIT ?? '64kb',

    // demo provider (only used when demoMode === 'on')
    demoSampleSeconds: num(overrides.demoSampleSeconds ?? env.DEMO_SAMPLE_SECONDS, 20),
    demoSampleHeight: num(overrides.demoSampleHeight ?? env.DEMO_SAMPLE_HEIGHT, 1080),
    demoSampleFps: num(overrides.demoSampleFps ?? env.DEMO_SAMPLE_FPS, 24),
    demoEncodeDelayMs: num(overrides.demoEncodeDelayMs ?? env.DEMO_ENCODE_DELAY_MS, 0),

    logLevel: overrides.logLevel ?? env.LOG_LEVEL ?? 'info',
  };

  // fileTtlMs alias for readability in tests
  config.fileTtlMs = config.ttlMs;
  return config;
}

export function ensureDirs(config) {
  for (const dir of [config.dataDir, config.tmpDir, config.jobsDir, config.cacheDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
