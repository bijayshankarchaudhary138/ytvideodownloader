/**
 * HTTP layer: Express app factory + REST routes + static SPA hosting.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import compression from 'compression';
import archiver from 'archiver';
import { ensureDirs } from '../config.js';
import { createLogger } from '../core/logger.js';
import { createCache } from '../services/cache.js';
import { createJobStore } from '../core/jobStore.js';
import { createRateLimiter } from '../core/rateLimit.js';
import { createDownloader } from '../services/downloader.js';
import { createBatchService } from '../services/batch.js';
import { createSseHub } from './sse.js';
import { buildOpenApi } from './openapi.js';
import { rewriteHtml, sitemapXml, robotsTxt } from '../seo/render.js';
import { seoPage, normaliseSlug, SEO_PAGES } from '../seo/pages.js';
import { PRESETS } from '../core/formats.js';
import { parseVideoUrl, extractUrls } from '../core/url.js';
import { parseRange, sanitizeFilename } from '../core/util.js';
import { listLanguages } from '../core/i18n/index.js';
import { runFfmpeg } from '../core/ffmpeg.js';
import { ytdlpVersion } from '../core/engine.js';

class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message ?? code);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function createApp({ config }) {
  ensureDirs(config);
  const logger = createLogger('http');
  const cache = createCache({ ttlMs: config.infoCacheTtlMs, max: config.infoCacheMax });
  const downloader = createDownloader({ config, logger, cache });
  const jobs = createJobStore({
    runner: (job, ctx) => downloader.runJob(job, ctx),
    concurrency: config.concurrency,
    ttlMs: config.ttlMs,
    maxQueueLength: config.maxQueueLength,
    logger,
  });
  const batches = createBatchService({ config, downloader, jobs, logger });
  const sse = createSseHub({ config, logger });
  const unsubscribe = jobs.subscribe((event) => {
    if (event.type === 'job:progress') sse.broadcast('job:progress', { id: event.id, progress: event.progress, job: event.job });
    else if (event.type === 'job:done') sse.broadcast('job:done', { job: event.job });
    else sse.broadcast(event.type, { job: event.job });
  });

  const sweeper = setInterval(() => {
    const expired = jobs.sweepExpired();
    if (expired) logger.info(`expired ${expired} job(s)`);
  }, config.sweepIntervalMs);
  sweeper.unref?.();

  const startedAt = Date.now();
  let ffmpegAvailable = null;
  async function checkFfmpeg() {
    if (ffmpegAvailable === null) {
      ffmpegAvailable = await runFfmpeg(['-version']).then(() => true).catch(() => false);
    }
    return ffmpegAvailable;
  }

  const generalLimiter = createRateLimiter({ max: config.rateLimitMax, windowMs: config.rateLimitWindowMs });
  const jobLimiter = createRateLimiter({ max: config.heavyRateLimitMax, windowMs: config.rateLimitWindowMs });

  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', true);
  app.set('etag', 'strong');

  /* ----------------------------- middleware ----------------------------- */
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-DNS-Prefetch-Control', 'off');
    if (req.path.startsWith('/api/')) {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin ?? '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Range');
      res.setHeader('Access-Control-Expose-Headers', 'Content-Length,Content-Range,Content-Disposition,Retry-After');
      res.setHeader('Vary', 'Origin');
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  app.use(compression({ threshold: 1024 }));
  app.use(express.json({ limit: config.bodyLimit }));

  // JSON body errors → canonical envelope
  app.use((err, req, res, next) => {
    if (err?.type === 'entity.too.large') {
      next(new HttpError(413, 'PAYLOAD_TOO_LARGE', 'That request was too large.'));
      return;
    }
    if (err instanceof SyntaxError && 'body' in err) {
      next(new HttpError(400, 'INVALID_JSON', 'The request body is not valid JSON.'));
      return;
    }
    next(err);
  });

  const clientKey = (req) => req.ip ?? req.socket?.remoteAddress ?? 'unknown';

  function limit(limiter, weight = 1) {
    return (req, res, next) => {
      const result = limiter.check(clientKey(req), weight);
      res.setHeader('X-RateLimit-Limit', String(result.limit));
      res.setHeader('X-RateLimit-Remaining', String(result.remaining));
      if (!result.allowed) {
        res.setHeader('Retry-After', String(result.retryAfter));
        next(new HttpError(429, 'RATE_LIMITED', 'Too many requests. Please try again shortly.', { retryAfter: result.retryAfter }));
        return;
      }
      next();
    };
  }

  const api = express.Router();
  api.use((req, res, next) => (req.path === '/events' ? next() : limit(generalLimiter)(req, res, next)));

  /* ------------------------------- meta -------------------------------- */
  api.get('/health', async (req, res) => {
    const [ffmpegOk, ytdlpVer] = await Promise.all([checkFfmpeg(), ytdlpVersion()]);
    res.json({
      status: 'ok',
      mode: config.demoMode === 'off' ? 'live' : 'demo',
      version: config.version,
      uptime: Math.round((Date.now() - startedAt) / 1000),
      engines: {
        ffmpeg: { available: Boolean(ffmpegOk) },
        ytdlp: { available: Boolean(ytdlpVer), version: ytdlpVer ?? null },
      },
      queue: jobs.stats(),
      cache: cache.stats(),
      sseClients: sse.size(),
    });
  });

  api.get('/meta', (req, res) => {
    res.json({
      version: config.version,
      mode: config.demoMode === 'off' ? 'live' : 'demo',
      presets: PRESETS.map((p) => ({
        id: p.id,
        label: p.label,
        kind: p.kind,
        ext: p.ext,
        height: p.height ?? null,
        bitrate: p.bitrate ?? null,
        popular: Boolean(p.popular),
        note: p.note ?? null,
      })),
      limits: {
        maxBatchSize: config.maxBatchSize,
        maxPlaylistItems: config.maxPlaylistItems,
        maxUrlsPerRequest: config.maxUrlsPerRequest,
        maxDurationSeconds: config.maxDurationSeconds,
        ttlHours: Math.round(config.ttlMs / 3600_000),
        maxQueueLength: config.maxQueueLength,
        concurrency: config.concurrency,
      },
      languages: listLanguages(),
      features: { playlist: true, subtitles: true, thumbnails: true, trim: true, metadata: true, api: true, progress: true, zip: true },
    });
  });

  api.get('/stats', (req, res) => {
    res.json({ jobs: jobs.stats(), batches: batches.size(), cache: cache.stats(), sseClients: sse.size() });
  });

  /* ------------------------------- info -------------------------------- */
  api.post('/info', limit(jobLimiter), async (req, res, next) => {
    try {
      const body = req.body ?? {};
      if (typeof body.url !== 'string' || !body.url.trim()) {
        throw new HttpError(400, 'INVALID_INPUT', 'A "url" field is required.');
      }
      const parsed = parseVideoUrl(body.url, { allowPrivateHosts: config.allowPrivateHosts });
      if (!parsed.ok) throw new HttpError(400, parsed.code, parsed.error);

      const result = await downloader.buildInfoResponse(body.url, { force: Boolean(body.refresh) });
      res.json({
        ...result,
        presets: PRESETS.filter((p) => (p.kind === result.type ? true : p.kind !== 'video' || result.type !== 'playlist'))
          .map((p) => ({ id: p.id, label: p.label, kind: p.kind, ext: p.ext, height: p.height ?? null, popular: Boolean(p.popular) })),
        limits: { maxPlaylistItems: config.maxPlaylistItems, maxBatchSize: config.maxBatchSize, ttlHours: Math.round(config.ttlMs / 3600_000) },
      });
    } catch (err) {
      next(err);
    }
  });

  /* ------------------------------- jobs -------------------------------- */
  function validateJobBody(body) {
    if (!body || typeof body !== 'object') throw new HttpError(400, 'INVALID_INPUT', 'A JSON body is required.');
    const { url, preset } = body;
    if (typeof url !== 'string' || !url.trim()) throw new HttpError(400, 'INVALID_INPUT', 'A "url" field is required.');
    if (typeof preset !== 'string' || !preset.trim()) throw new HttpError(400, 'INVALID_INPUT', 'A "preset" field is required.');

    const parsed = parseVideoUrl(url, { allowPrivateHosts: config.allowPrivateHosts });
    if (!parsed.ok) throw new HttpError(400, parsed.code, parsed.error);

    const known = PRESETS.find((p) => p.id === preset.trim());
    if (!known) {
      throw new HttpError(400, 'INVALID_PRESET', `Unknown preset: ${preset}`, { presets: PRESETS.map((p) => p.id) });
    }

    let trim = null;
    if (body.trim !== undefined && body.trim !== null) {
      const start = Number(body.trim?.start);
      const end = Number(body.trim?.end);
      if (!Number.isFinite(start) || !Number.isFinite(end) || !(end > start) || start < 0) {
        throw new HttpError(400, 'INVALID_TRIM', 'The trim range must have start < end and both numeric.', { start, end });
      }
      trim = { start, end };
    }

    let subtitle = null;
    if (body.subtitle !== undefined && body.subtitle !== null) {
      const lang = String(body.subtitle?.lang ?? 'en').slice(0, 12);
      if (!/^[a-zA-Z-]{2,12}$/.test(lang)) throw new HttpError(400, 'INVALID_INPUT', 'Invalid subtitle language.');
      subtitle = { lang: lang.toLowerCase(), auto: Boolean(body.subtitle?.auto) };
    }

    const title = typeof body.title === 'string' ? body.title.slice(0, 300) : null;
    return { url: parsed.url, preset: known.id, kind: known.kind, trim, subtitle, title, parsed };
  }

  api.post('/jobs', limit(jobLimiter), (req, res, next) => {
    try {
      const input = validateJobBody(req.body);
      const job = jobs.create({
        url: input.url,
        preset: input.preset,
        kind: input.kind,
        title: input.title,
        trim: input.trim,
        subtitle: input.subtitle,
      });
      res.status(201).json({ job });
    } catch (err) {
      if (err?.code === 'QUEUE_FULL') {
        next(new HttpError(429, 'QUEUE_FULL', 'The server queue is full. Please try again in a moment.'));
        return;
      }
      next(err);
    }
  });

  api.get('/jobs', (req, res) => {
    const limitNum = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);
    const status = typeof req.query.status === 'string' && req.query.status ? req.query.status.split(',') : null;
    res.json({ jobs: jobs.list({ status, limit: limitNum }), stats: jobs.stats() });
  });

  api.get('/jobs/:id/status', (req, res, next) => {
    const job = jobs.get(req.params.id);
    if (!job) return next(new HttpError(404, 'JOB_NOT_FOUND', 'No such job.'));
    res.json({ job: { id: job.id, status: job.status, progress: job.progress, fileUrl: job.fileUrl, error: job.error } });
  });

  api.get('/jobs/:id', (req, res, next) => {
    const job = jobs.get(req.params.id);
    if (!job) return next(new HttpError(404, 'JOB_NOT_FOUND', 'No such job.'));
    res.json({ job });
  });

  api.delete('/jobs/:id', (req, res, next) => {
    const removed = jobs.remove(req.params.id);
    if (!removed) return next(new HttpError(404, 'JOB_NOT_FOUND', 'No such job.'));
    res.status(204).end();
  });

  api.post('/jobs/:id/cancel', (req, res, next) => {
    const job = jobs.get(req.params.id);
    if (!job) return next(new HttpError(404, 'JOB_NOT_FOUND', 'No such job.'));
    const ok = jobs.cancel(req.params.id);
    if (!ok) {
      next(new HttpError(409, 'JOB_FINISHED', `This job is already ${job.status}.`));
      return;
    }
    res.json({ job: jobs.get(req.params.id) });
  });

  api.post('/jobs/:id/retry', (req, res, next) => {
    const job = jobs.get(req.params.id);
    if (!job) return next(new HttpError(404, 'JOB_NOT_FOUND', 'No such job.'));
    res.json({ job: jobs.retry(req.params.id) });
  });

  /* ------------------------------ batches ------------------------------ */
  api.post('/batch', limit(jobLimiter), async (req, res, next) => {
    try {
      const body = req.body ?? {};
      const basePreset = typeof body.preset === 'string' && body.preset.trim() ? body.preset.trim() : 'mp4-1080';
      const { batch } = await batches.create({
        urls: Array.isArray(body.urls) ? body.urls : [],
        url: typeof body.url === 'string' ? body.url : null,
        preset: basePreset,
        maxItems: body.maxItems,
        subtitle: body.subtitle ?? null,
        trim: body.trim ?? null,
      });
      res.status(201).json({ batch });
    } catch (err) {
      if (err?.code === 'INVALID_PRESET') {
        next(new HttpError(400, 'INVALID_PRESET', err.message, { presets: PRESETS.map((p) => p.id) }));
        return;
      }
      next(err);
    }
  });

  api.get('/batch/:id', (req, res, next) => {
    const batch = batches.get(req.params.id);
    if (!batch) return next(new HttpError(404, 'BATCH_NOT_FOUND', 'No such batch.'));
    res.json({ batch });
  });

  api.get('/batch/:id/zip', async (req, res, next) => {
    try {
      const batch = batches.get(req.params.id);
      if (!batch) throw new HttpError(404, 'BATCH_NOT_FOUND', 'No such batch.');
      const files = batches.filesForZip(req.params.id) ?? [];
      if (batch.status !== 'done') {
        throw new HttpError(409, 'BATCH_NOT_READY', 'The batch is still downloading.', { pending: batch.pending, total: batch.total });
      }
      if (!files.length) throw new HttpError(410, 'NO_FILES', 'No files are left for this batch (they may have expired).');

      const archive = archiver('zip', { zlib: { level: 6 } });
      archive.on('error', next);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="youtube-downloader-${req.params.id}.zip"`);
      res.setHeader('Cache-Control', 'no-store');
      archive.pipe(res);
      for (const file of files) archive.file(file.path, { name: file.name });
      await archive.finalize();
    } catch (err) {
      next(err);
    }
  });

  /* ------------------------------- files ------------------------------- */
  api.get('/files/:id', async (req, res, next) => {
    try {
      const job = jobs.get(req.params.id);
      if (!job) throw new HttpError(404, 'JOB_NOT_FOUND', 'No such file.');
      const internal = jobs.peek(req.params.id);
      const filePath = internal?.filePath;
      if (job.status === 'expired') throw new HttpError(410, 'FILE_EXPIRED', 'This file expired and was deleted.');
      if (!filePath) throw new HttpError(404, 'FILE_NOT_READY', 'This job has no file yet.');
      let stat;
      try {
        stat = await fsp.stat(filePath);
      } catch {
        throw new HttpError(410, 'FILE_GONE', 'This file is no longer available.');
      }

      const headers = {
        'Content-Type': job.mimeType ?? 'application/octet-stream',
        'Content-Disposition': contentDisposition(job.filename ?? path.basename(filePath)),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'private, max-age=0, must-revalidate',
        'Last-Modified': new Date(stat.mtimeMs).toUTCString(),
      };

      const range = parseRange(req.headers.range, stat.size);
      if (range === 'unsatisfiable') {
        res.writeHead(416, { ...headers, 'Content-Range': `bytes */${stat.size}` });
        res.end();
        return;
      }
      if (range) {
        res.writeHead(206, {
          ...headers,
          'Content-Range': `bytes ${range.start}-${range.end}/${stat.size}`,
          'Content-Length': String(range.end - range.start + 1),
        });
        fs.createReadStream(filePath, { start: range.start, end: range.end }).pipe(res);
        return;
      }

      res.writeHead(200, { ...headers, 'Content-Length': String(stat.size) });
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      fs.createReadStream(filePath).pipe(res);
    } catch (err) {
      next(err);
    }
  });

  /* ---------------------------- thumbnails ----------------------------- */
  api.get('/thumb/:videoId/:name', async (req, res, next) => {
    try {
      const videoId = String(req.params.videoId);
      const thumbId = path.basename(String(req.params.name)).replace(/\.(jpg|jpeg|webp|png)$/i, '');
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(videoId)) throw new HttpError(400, 'INVALID_INPUT', 'Invalid video id.');
      if (config.demoMode === 'on') {
        const file = await downloader.demo.thumbnailFile(videoId, thumbId);
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        fs.createReadStream(file).pipe(res);
        return;
      }
      const allowed = ['default', 'mqdefault', 'hqdefault', 'sddefault', 'maxresdefault'];
      if (!allowed.includes(thumbId)) throw new HttpError(404, 'NOT_FOUND', 'Unknown thumbnail size.');
      res.redirect(302, `https://i.ytimg.com/vi/${videoId}/${thumbId}.jpg`);
    } catch (err) {
      next(err);
    }
  });

  /* ----------------------------- subtitles ----------------------------- */
  api.get('/subs/:videoId/:lang', async (req, res, next) => {
    try {
      if (config.demoMode !== 'on') throw new HttpError(404, 'NOT_FOUND', 'Subtitle streaming is only available in demo mode; use the API job flow.');
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(String(req.params.videoId))) {
        throw new HttpError(400, 'INVALID_VIDEO_ID', 'Invalid video id.');
      }
      const langRaw = String(req.params.lang).replace(/\.(vtt|srt)$/i, '');
      const auto = langRaw.startsWith('auto-');
      const lang = (auto ? langRaw.slice(5) : langRaw).slice(0, 12);
      const info = downloader.demo._buildInfo({ videoId: req.params.videoId, type: 'video', kind: 'watch' });
      const srt = downloader.demo.buildSrt(info, lang.toLowerCase().split('-')[0], auto);
      // serve WebVTT (browsers need it for <track>); commas → dots in timestamps
      res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
      res.send(`WEBVTT\n\n${srt.replace(/,(\d{3})/g, '.$1')}`);
    } catch (err) {
      next(err);
    }
  });

  /* -------------------------------- SSE -------------------------------- */
  api.get('/events', (req, res) => {
    sse.handler(req, res);
  });

  /* ------------------------------ openapi ------------------------------ */
  api.get('/openapi.json', (req, res) => {
    res.json(buildOpenApi({ version: config.version, config }));
  });

  /* ------------------------------ bulk text ---------------------------- */
  api.post('/extract-urls', (req, res, next) => {
    // Used by the "paste a playlist link" box, so it must be forgiving about
    // whitespace but explicit about a missing field.
    if (typeof req.body?.text !== 'string' || !req.body.text.trim()) {
      return next(new HttpError(400, 'INVALID_INPUT', 'A "text" field containing links is required.'));
    }
    res.json({ urls: extractUrls(req.body.text, { max: config.maxUrlsPerRequest }) });
  });

  app.use('/api', api);

  // Nothing above matched: answer with a typed envelope instead of letting the
  // request fall through to the SPA handler (which would return HTML to an API
  // client) — and use 405 + Allow when the path exists but the verb does not.
  const documentedRoutes = buildDocumentedRoutes(config);
  app.use('/api', (req, res) => {
    // Inside app.use('/api', …) req.path is mount-relative, so rebuild the full path.
    const fullPath = ((req.baseUrl ?? '') + (req.path ?? '')).replace(/\/+$/, '') || '/api';
    const hit = documentedRoutes.find((route) => route.regex.test(fullPath));
    if (hit) {
      res.setHeader('Allow', [...hit.methods, 'OPTIONS'].join(', '));
      res.status(405).json({
        error: {
          code: 'METHOD_NOT_ALLOWED',
          message: `${req.method} is not supported on ${fullPath}.`,
          details: { allow: hit.methods },
        },
      });
      return;
    }
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Unknown API endpoint.' } });
  });

  /* ------------------------------ static ------------------------------- */
  // Published URLs (canonical, hreflang, og:url, JSON-LD, sitemap) are written
  // with a placeholder origin so the repo stays host-agnostic; the real origin
  // is injected per request (or pinned with SITE_URL).
  const SITE_PLACEHOLDER = 'https://example.com';
  const shellCache = new Map(); // filePath → { mtimeMs, text }

  function resolveSiteUrl(req) {
    if (config.siteUrl) return config.siteUrl;
    const host = String(req.headers.host ?? '').trim();
    if (/^[A-Za-z0-9.-]+(:\d+)?$/.test(host)) {
      const proto = req.protocol === 'https' || String(req.headers['x-forwarded-proto'] ?? '').startsWith('https') ? 'https' : 'http';
      return `${proto}://${host}`;
    }
    return `http://localhost:${config.port}`;
  }

  /** Verification <meta> tags for search engines, when configured. */
  function verificationTags() {
    const tags = [];
    if (config.siteVerification?.google) {
      tags.push(`<meta name="google-site-verification" content="${config.siteVerification.google}" />`);
    }
    if (config.siteVerification?.bing) {
      tags.push(`<meta name="msvalidate.01" content="${config.siteVerification.bing}" />`);
    }
    return tags.join('\n    ');
  }

  function readTemplate(filePath) {
    if (!fs.existsSync(filePath)) return null;
    const { mtimeMs } = fs.statSync(filePath);
    let entry = shellCache.get(filePath);
    if (!entry || entry.mtimeMs !== mtimeMs) {
      entry = { mtimeMs, text: fs.readFileSync(filePath, 'utf8') };
      shellCache.set(filePath, entry);
    }
    return entry.text;
  }

  /**
   * Rewrites the SPA shell for the requested route: origin, per-route title /
   * description / canonical / hreflang / OG and the crawlable content block plus
   * its JSON-LD. Crawlers that do not run JavaScript see a complete page.
   */
  function readRewritten(filePath, req, { slug = '/' } = {}) {
    const template = readTemplate(filePath);
    if (template === null) return null;
    const siteUrl = resolveSiteUrl(req);
    if (!filePath.endsWith('.html')) {
      return template.split(SITE_PLACEHOLDER).join(siteUrl);
    }
    return rewriteHtml(template, { page: seoPage(slug), siteUrl, verificationTags: verificationTags() });
  }

  /** Serve an HTML/text file with the deployment origin substituted in. */
  function serveSiteFile(req, res, filePath, { contentType, cacheControl, slug = '/' } = {}) {
    const text = readRewritten(filePath, req, { slug });
    if (text === null) return false;
    if (contentType) res.type(contentType);
    if (cacheControl) res.setHeader('Cache-Control', cacheControl);
    if (String(contentType).includes('html')) applyHtmlSecurityHeaders(res);
    res.send(text);
    return true;
  }

  // robots.txt + sitemap.xml are generated per request so a self-hosted copy
  // always advertises its own origin (no placeholder domains in the wild).
  const textCache = config.isProd ? 'public, max-age=3600' : 'no-cache';
  app.get('/robots.txt', (req, res) => {
    res.type('text/plain; charset=utf-8').setHeader('Cache-Control', textCache);
    res.send(robotsTxt({ siteUrl: resolveSiteUrl(req) }));
  });

  app.get('/sitemap.xml', (req, res) => {
    res.type('application/xml; charset=utf-8').setHeader('Cache-Control', textCache);
    res.send(sitemapXml({ siteUrl: resolveSiteUrl(req) }));
  });

  // The home page plus every SEO landing page: same SPA shell, different
  // crawlable content, titles and structured data.
  const shellRoutes = ['/', '/index.html', ...SEO_PAGES.map((page) => page.slug)];
  for (const route of shellRoutes) {
    app.get(route, (req, res, next) => {
      const filePath = path.join(config.webDistDir, 'index.html');
      const slug = route === '/index.html' ? '/' : normaliseSlug(route);
      if (serveSiteFile(req, res, filePath, { contentType: 'text/html; charset=utf-8', cacheControl: 'no-cache', slug })) return;
      next();
    });
  }

  const staticOptions = {
    maxAge: config.isProd ? '1h' : 0,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) applyHtmlSecurityHeaders(res);
      if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
      if (/\.(js|css|woff2?|jpg|png|svg|webp)$/.test(filePath)) {
        res.setHeader('Cache-Control', config.isProd ? 'public, max-age=31536000, immutable' : 'no-cache');
      }
    },
  };
  if (fs.existsSync(config.webPublicDir)) app.use(express.static(config.webPublicDir, staticOptions));
  if (fs.existsSync(config.webDistDir)) app.use(express.static(config.webDistDir, staticOptions));

  // Path traversal attempts are rejected before they can reach any handler.
  app.use((req, res, next) => {
    const raw = req.originalUrl ?? req.url ?? '';
    if (raw.includes('..') || /%2e%2e|%00/i.test(raw)) {
      next(new HttpError(400, 'INVALID_PATH', 'That request path is not allowed.'));
      return;
    }
    next();
  });

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) {
      next(new HttpError(404, 'NOT_FOUND', 'Unknown API endpoint.'));
      return;
    }
    // Only real page navigations get the SPA shell — a missing asset stays a 404.
    const looksLikeAsset = path.extname(req.path) !== '' || !req.accepts('html');
    if (looksLikeAsset) {
      next(new HttpError(404, 'NOT_FOUND', 'Not found.'));
      return;
    }
    const indexPath = path.join(config.webDistDir, 'index.html');
    if (serveSiteFile(req, res, indexPath, { contentType: 'text/html; charset=utf-8', cacheControl: 'no-cache', slug: req.path })) return;
    res.status(200).type('html').send(fallbackPage(config));
  });

  /* --------------------------- error handler --------------------------- */
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err?.status ?? STATUS_BY_CODE[err?.code] ?? 500;
    const code = err?.code && /^[A-Z_]+$/.test(err.code) ? err.code : 'INTERNAL_ERROR';
    if (status >= 500) {
      logger.error(`unhandled error on ${req.method} ${req.path}:`, err?.stack ?? err?.message ?? err);
    }
    const message = status >= 500
      ? 'Something went wrong on the server. Please try again.'
      : (err?.message ?? 'Request failed.');
    res.status(status).json({ error: { code, message, ...(err?.details ? { details: err.details } : {}) } });
  });

  const services = {
    jobs,
    batches,
    downloader,
    cache,
    sse,
    logger,
    config,
    startedAt,
    async shutdown() {
      clearInterval(sweeper);
      unsubscribe();
      sse.closeAll();
      jobs.shutdown();
      jobs.sweepExpired(Date.now() + config.ttlMs * 10);
    },
  };

  return { app, services, HttpError };
}

/** CSP + framing headers for every HTML response (static shell or SPA fallback). */
function applyHtmlSecurityHeaders(res) {
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "img-src 'self' data: https://i.ytimg.com https://*.ytimg.com",
    "media-src 'self' blob: https:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self'",
    "connect-src 'self'",
    "font-src 'self' data:",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '));
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
}

/**
 * Route table derived from the OpenAPI document: lets us answer a wrong verb
 * with 405 + Allow instead of a generic 404.
 */
function buildDocumentedRoutes(config) {
  try {
    const paths = buildOpenApi({ config }).paths ?? {};
    return Object.entries(paths).map(([template, operations]) => ({
      regex: new RegExp(`^${template.replace(/\{[^}]+\}/g, '[^/]+')}$`),
      methods: Object.keys(operations).map((m) => m.toUpperCase()),
    }));
  } catch {
    return [];
  }
}

/** Typed engine/service errors → HTTP status codes (exported as a contract). */
export const STATUS_BY_CODE = {
  INVALID_INPUT: 400,
  INVALID_URL: 400,
  INVALID_VIDEO_ID: 400,
  BLOCKED_HOST: 400,
  UNSUPPORTED_URL: 400,
  INVALID_PRESET: 400,
  INVALID_TRIM: 400,
  INVALID_PATH: 400,
  FORMAT_UNAVAILABLE: 400,
  VIDEO_UNAVAILABLE: 404,
  PRIVATE_VIDEO: 404,
  NOT_FOUND: 404,
  JOB_NOT_FOUND: 404,
  BATCH_NOT_FOUND: 404,
  FILE_NOT_READY: 404,
  BATCH_NOT_READY: 409,
  JOB_FINISHED: 409,
  FILE_EXPIRED: 410,
  FILE_GONE: 410,
  NO_FILES: 410,
  BOT_CHECK: 503,
  GEO_BLOCKED: 451,
  RATE_LIMITED: 429,
  QUEUE_FULL: 429,
  TOO_LONG: 413,
  PAYLOAD_TOO_LARGE: 413,
  TIMEOUT: 504,
};

function contentDisposition(filename) {
  const ascii = sanitizeFilename(filename).replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '');
  const encoded = encodeURIComponent(filename);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

function fallbackPage(config) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>YouTube Video Downloader</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="Ad-free YouTube downloader API and web UI. Real 4K with merged audio, MP3 320 kbps, playlists, subtitles and live progress.">
<style>body{font-family:system-ui,sans-serif;max-width:720px;margin:3rem auto;padding:0 1rem;line-height:1.6;color:#111;background:#fff}
code{background:#f4f4f5;padding:.15rem .35rem;border-radius:.25rem}@media(prefers-color-scheme:dark){body{background:#0b0b0f;color:#eee}code{background:#1f2937}}</style>
</head><body><main><h1>YouTube Video Downloader</h1>
<p>The API is running (v${config.version}). The web interface has not been built yet.</p>
<p>Run <code>npm run build</code> to generate the UI, or use the API directly:</p>
<ul><li><code>GET /api/health</code></li><li><code>POST /api/info</code> with <code>{"url":"…"}</code></li>
<li><code>POST /api/jobs</code> with <code>{"url":"…","preset":"mp4-1080"}</code></li>
<li><code>GET /api/events</code> for live progress</li><li><code>GET /api/openapi.json</code> for the specification</li></ul>
</main></body></html>`;
}
