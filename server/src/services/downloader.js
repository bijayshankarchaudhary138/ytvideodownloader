/**
 * Orchestrates a single download job:
 *   url → metadata → format selection → provider → finished file + job fields.
 */
import fsp from 'node:fs/promises';
import path from 'node:path';
import { parseVideoUrl, canonicalWatchUrl } from '../core/url.js';
import { buildFormatCatalog, selectFormatForPreset, sanitizeTrim, humanBytes } from '../core/formats.js';
import { sanitizeFilename } from '../core/util.js';
import { ytdlpAvailable } from '../core/engine.js';
import { createDemoProvider } from '../providers/demo.js';
import { createYtDlpProvider } from '../providers/ytdlp.js';

const MIME = {
  mp4: 'video/mp4', mkv: 'video/x-matroska', webm: 'video/webm',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', opus: 'audio/ogg', wav: 'audio/wav', flac: 'audio/flac',
  srt: 'application/x-subrip', vtt: 'text/vtt', jpg: 'image/jpeg', png: 'image/png', json: 'application/json',
};

export function mimeForExtension(ext) {
  return MIME[String(ext ?? '').toLowerCase().replace(/^\./, '')] ?? 'application/octet-stream';
}

/** Cache key: canonical id + playlist, ignoring timestamp/utm noise. */
export function infoCacheKey(parsed) {
  if (parsed.type === 'playlist') return `playlist:${parsed.playlistId}`;
  if (parsed.videoId) return `video:${parsed.videoId}:${parsed.playlistId ?? ''}`;
  return `url:${parsed.url}`;
}

export function createDownloader({ config, logger, cache }) {
  const demo = createDemoProvider({ config, logger });
  const live = createYtDlpProvider({ config, logger });

  let liveAvailable = null;
  async function isLiveAvailable() {
    if (config.demoMode === 'on') return false;
    if (config.demoMode === 'off') return true;
    if (liveAvailable === null) liveAvailable = await ytdlpAvailable();
    return liveAvailable;
  }

  /** Resolve metadata for a URL (cached). Throws typed errors. */
  async function resolveInfo(rawUrl, { force = false, signal } = {}) {
    const parsed = parseVideoUrl(rawUrl, { allowPrivateHosts: config.allowPrivateHosts });
    if (!parsed.ok) {
      throw Object.assign(new Error(parsed.error), { code: parsed.code, details: { url: rawUrl } });
    }
    const provider = (await isLiveAvailable()) ? live : demo;
    const key = infoCacheKey(parsed);
    if (force) cache.del(key);

    const { value, cached } = await cache.wrap(
      key,
      async () => {
        const info = await provider.probe(parsed.url, parsed, { signal });
        return { info, parsed, provider: provider.id, fetchedAt: Date.now() };
      },
    );

    return { parsed, info: value.info, provider: value.provider, cached };
  }

  /** Shape returned by POST /api/info. */
  async function buildInfoResponse(rawUrl, opts = {}) {
    const { parsed, info, provider, cached } = await resolveInfo(rawUrl, opts);

    if (parsed.type === 'playlist' && Array.isArray(info.entries)) {
      const entries = info.entries.slice(0, config.maxPlaylistItems).map((entry, index) => ({
        index: index + 1,
        id: entry.id,
        title: entry.title,
        duration: entry.duration ?? 0,
        url: entry.webpage_url ?? entry.url ?? canonicalWatchUrl(entry.id),
        thumbnail: entry.thumbnail ?? null,
        uploader: entry.uploader ?? entry.channel ?? null,
      }));
      return {
        type: 'playlist',
        engine: provider,
        cached,
        playlist: {
          id: info.id ?? parsed.playlistId,
          title: info.title ?? 'Playlist',
          count: info.playlist_count ?? entries.length,
          entries,
        },
        video: {
          id: info.id ?? parsed.playlistId,
          title: info.title ?? 'Playlist',
          channel: info.uploader ?? null,
          duration: entries.reduce((sum, e) => sum + (e.duration || 0), 0),
          thumbnail: entries[0]?.thumbnail ?? null,
          webpageUrl: parsed.url,
          isLive: false,
        },
        formats: { video: [], audio: [], combined: [] },
        subtitles: { manual: [], auto: [] },
        thumbnails: [],
        chapters: [],
      };
    }

    const catalog = buildFormatCatalog(info);
    return {
      type: 'video',
      engine: provider,
      cached,
      video: catalog.meta,
      formats: {
        video: catalog.video,
        audio: catalog.audio,
        combined: catalog.combined,
        best: catalog.video[0] ?? catalog.combined[0] ?? null,
      },
      subtitles: catalog.subtitles,
      thumbnails: catalog.thumbnails,
      chapters: catalog.chapters,
      presets: undefined,
    };
  }

  /**
   * Job runner (used by the job store).
   * Sets every user-visible field on the job; throws typed errors on failure.
   */
  async function runJob(job, ctx) {
    const { parsed, info, provider, cached } = await resolveInfo(job.url, { signal: ctx.signal });
    if (!cached) ctx.log?.(`metadata resolved via ${provider}`);

    const catalog = buildFormatCatalog(info);
    const duration = catalog.meta.duration || 0;
    if (config.maxDurationSeconds && duration > config.maxDurationSeconds) {
      throw Object.assign(new Error('video is longer than this server allows'), { code: 'TOO_LONG' });
    }

    const trim = sanitizeTrim(job.trim, duration);
    if (job.trim && !trim) {
      throw Object.assign(new Error('the trim range is invalid'), { code: 'INVALID_TRIM' });
    }

    const selection = selectFormatForPreset(catalog, job.preset);
    const dir = path.join(config.jobsDir, job.id);
    await fsp.mkdir(dir, { recursive: true });

    ctx.update({
      status: 'downloading',
      engine: provider,
      title: catalog.meta.title ?? job.title ?? null,
      needsMux: Boolean(selection.needsMux),
      height: selection.height ?? null,
      width: selection.width ?? null,
      quality: selection.quality ?? null,
      qualityFallback: selection.fallbackFrom ?? null,
      duration: trim ? trim.end - trim.start : duration,
      progress: { stage: selection.kind === 'audio' ? 'downloading' : 'downloading', percent: 1 },
    });

    const onProgress = (p) => {
      ctx.progress({
        percent: p.percent ?? undefined,
        speed: p.speed ?? null,
        eta: p.eta ?? null,
        downloaded: p.downloaded ?? null,
        total: p.total ?? null,
        stage: p.stage ?? 'downloading',
      });
    };

    let produced;
    const providerImpl = provider === 'demo' ? demo : live;

    if (selection.kind === 'subtitle') {
      produced = provider === 'demo'
        ? await demo.produceSubtitle({ info, job, dir })
        : await live.download({ selection, job, dir, onProgress, signal: ctx.signal });
    } else if (selection.kind === 'image') {
      produced = provider === 'demo'
        ? await demo.produceThumbnail({ info, dir })
        : await live.download({ selection, job, dir, onProgress, signal: ctx.signal });
    } else if (selection.kind === 'data') {
      produced = provider === 'demo'
        ? await demo.produceMetadata({ info, dir })
        : await live.download({ selection, job, dir, onProgress, signal: ctx.signal });
    } else if (selection.kind === 'audio') {
      produced = provider === 'demo'
        ? await demo.produceAudio({ info, selection, dir, trim, onProgress, signal: ctx.signal })
        : await live.download({ selection, job, dir, onProgress, signal: ctx.signal });
      if (provider !== 'demo' && job.trim) ctx.log?.('trim applied by yt-dlp');
    } else {
      produced = provider === 'demo'
        ? await demo.produceVideo({ info, selection, dir, trim, onProgress, signal: ctx.signal })
        : await live.download({ selection, job, dir, onProgress, signal: ctx.signal });
    }

    if (ctx.signal?.aborted) throw Object.assign(new Error('aborted'), { code: 'ABORTED' });

    /* --------- finalise: give the file a human name --------- */
    const ext = path.extname(produced.file).slice(1).toLowerCase() || selection.ext;
    const baseTitle = sanitizeFilename(catalog.meta.title ?? job.title ?? 'video', 'video');
    const trimSuffix = trim ? `-trim-${Math.round(trim.start)}s-${Math.round(trim.end)}s` : '';
    const subtitleSuffix = selection.kind === 'subtitle' ? `-${job.subtitle?.lang ?? 'en'}` : '';
    const filename = path.basename(`${baseTitle}${trimSuffix}${subtitleSuffix}.${ext}`).slice(0, 200);

    const finalPath = path.join(dir, filename);
    if (path.resolve(produced.file) !== path.resolve(finalPath)) {
      await fsp.rename(produced.file, finalPath).catch(async () => {
        await fsp.copyFile(produced.file, finalPath);
        await fsp.rm(produced.file, { force: true });
      });
    }
    const stat = await fsp.stat(finalPath);

    ctx.update({
      status: 'ready',
      filename,
      fileUrl: `/api/files/${job.id}`,
      filePath: finalPath,
      size: stat.size,
      sizeText: humanBytes(stat.size),
      mimeType: mimeForExtension(ext),
      ext,
      needsMux: Boolean(selection.needsMux ?? produced.needsMux),
      height: produced.height ?? selection.height ?? null,
      width: produced.width ?? selection.width ?? null,
      quality: selection.quality ?? null,
      trim: trim ?? null,
      progress: { stage: 'ready', percent: 100, speed: null, eta: 0 },
    });
    ctx.log?.(`ready: ${filename} (${humanBytes(stat.size)})`);
    return finalPath;
  }

  return {
    resolveInfo,
    buildInfoResponse,
    runJob,
    demo,
    live,
    isLiveAvailable,
    get engineIds() { return { demo: demo.id, live: live.id }; },
  };
}
