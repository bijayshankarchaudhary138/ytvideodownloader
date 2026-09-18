/**
 * Demo provider.
 *
 * Runs the *real* pipeline (ffmpeg encode → mux → serve → Range requests) but
 * against a locally generated master clip instead of hitting YouTube. This is
 * what makes the project testable in networks where YouTube is blocked, and it
 * is also what `DEMO_MODE=on` serves to visitors of a demo deployment.
 *
 * The synthetic yt-dlp document mirrors YouTube's shape: high resolutions exist
 * only as video-only streams (so the muxing path is exercised honestly).
 */
import fsp from 'node:fs/promises';
import path from 'node:path';
import { generateSampleVideo, runFfmpeg, parseProgressLine } from '../core/ffmpeg.js';
import { humanDuration } from '../core/formats.js';

const THUMB_SIZES = [
  { id: 'default', w: 120, h: 90 },
  { id: 'mqdefault', w: 320, h: 180 },
  { id: 'hqdefault', w: 480, h: 360 },
  { id: 'sddefault', w: 640, h: 480 },
  { id: 'maxresdefault', w: 1280, h: 720 },
];

// 11-character ids, exactly like YouTube's.
const DEMO_PLAYLIST_IDS = ['demoEntry01', 'demoEntry02', 'demoEntry03', 'demoEntry04', 'demoEntry05'];

export function createDemoProvider({ config, logger }) {
  const masterCache = new Map();
  const inFlight = new Map(); // single-flight guard: never render the same file twice

  const masterPath = () => path.join(config.cacheDir, `demo-master-${config.demoSampleHeight}p.mp4`);
  const thumbDir = (videoId) => path.join(config.cacheDir, 'demo-thumbs', videoId);

  async function ensureDir(dir) {
    await fsp.mkdir(dir, { recursive: true });
  }

  /** Serialise generation of a given artefact (concurrent jobs would race). */
  async function once(key, factory) {
    if (inFlight.has(key)) return inFlight.get(key);
    const promise = (async () => factory())();
    inFlight.set(key, promise);
    try {
      return await promise;
    } finally {
      inFlight.delete(key);
    }
  }

  async function ensureMaster() {
    const file = masterPath();
    if (masterCache.has(file)) return file;
    return once(`master:${file}`, async () => {
      if (masterCache.has(file)) return file;
      try {
        const stat = await fsp.stat(file);
        if (stat.size > 1000) {
          masterCache.set(file, true);
          return file;
        }
      } catch { /* generate below */ }
      logger.info?.(`generating demo master clip (${config.demoSampleHeight}p, ${config.demoSampleSeconds}s)`);
      await generateSampleVideo(file, {
        seconds: config.demoSampleSeconds,
        height: config.demoSampleHeight,
        fps: config.demoSampleFps,
      });
      masterCache.set(file, true);
      return file;
    });
  }

  /* ------------------------------------------------------------------ *
   * Synthetic metadata
   * ------------------------------------------------------------------ */
  function videoHeights() {
    const master = config.demoSampleHeight;
    return [2160, 1440, 1080, 720, 480, 360, 240, 144].filter((h) => h <= master);
  }

  function buildInfo(parsed) {
    const duration = config.demoSampleSeconds;
    const rawId = String(parsed.videoId ?? 'demoVideo01');
    const videoId = /^[A-Za-z0-9_-]{11}$/.test(rawId) ? rawId : rawId.padEnd(11, 'x').slice(0, 11);
    const title = parsed.type === 'playlist'
      ? 'Demo playlist — free downloader showcase'
      : `Demo video (${parsed.kind === 'shorts' ? 'Short' : '1080p showcase'}) — no ads, real 4K engine`;

    const formats = [];
    for (const height of videoHeights()) {
      if (height === 360 || height === 720) {
        formats.push({
          format_id: `18-${height}`,
          ext: 'mp4',
          vcodec: 'avc1.42001E',
          acodec: 'mp4a.40.2',
          width: Math.round((height * 16) / 9 / 2) * 2,
          height,
          fps: config.demoSampleFps,
          tbr: Math.round(height * 1.1),
          filesize: Math.round(height * 90_000 * (duration / 10)),
          protocol: 'https',
        });
      }
      formats.push({
        format_id: `v-${height}`,
        ext: height > 1080 ? 'webm' : 'mp4',
        vcodec: height > 1080 ? 'vp9' : 'avc1.640028',
        acodec: 'none',
        width: Math.round((height * 16) / 9 / 2) * 2,
        height,
        fps: config.demoSampleFps,
        tbr: Math.round(height * 2.2),
        filesize: Math.round(height * 180_000 * (duration / 10)),
        protocol: 'https',
      });
    }
    formats.push(
      { format_id: 'a-128', ext: 'm4a', vcodec: 'none', acodec: 'mp4a.40.2', abr: 128, asr: 44100, filesize: Math.round(16_000 * duration), protocol: 'https' },
      { format_id: 'a-160', ext: 'webm', vcodec: 'none', acodec: 'opus', abr: 160, asr: 48000, filesize: Math.round(20_000 * duration), protocol: 'https' },
    );

    return {
      id: videoId,
      title,
      uploader: 'Demo Channel',
      channel_id: 'UCdemoChannel0000000',
      channel_url: 'https://www.youtube.com/@demo-channel',
      duration,
      view_count: 1_234_567 + duration,
      like_count: 98_765,
      upload_date: '20240115',
      description: 'This is a demonstration clip rendered locally by ffmpeg. It proves the download pipeline works end to end without contacting YouTube.',
      thumbnail: `/api/thumb/${videoId}/maxresdefault.jpg`,
      webpage_url: `https://www.youtube.com/watch?v=${videoId}`,
      is_live: false,
      age_limit: 0,
      extractor: 'demo',
      language: 'en',
      categories: ['Science & Technology'],
      tags: ['downloader', 'demo', 'ffmpeg'],
      formats,
      chapters: [
        { start_time: 0, end_time: Math.min(2, duration), title: 'Intro' },
        { start_time: Math.min(2, duration), end_time: duration, title: 'Demo content' },
      ],
      thumbnails: THUMB_SIZES.map((t) => ({
        id: t.id,
        url: `/api/thumb/${videoId}/${t.id}.jpg`,
        width: t.w,
        height: t.h,
      })),
      subtitles: {
        en: [{ ext: 'vtt', url: `/api/subs/${videoId}/en.vtt`, name: 'English' }],
        hi: [{ ext: 'vtt', url: `/api/subs/${videoId}/hi.vtt`, name: 'हिन्दी' }],
      },
      automatic_captions: {
        en: [{ ext: 'vtt', url: `/api/subs/${videoId}/auto-en.vtt`, name: 'English (auto)' }],
        de: [{ ext: 'vtt', url: `/api/subs/${videoId}/auto-de.vtt`, name: 'Deutsch (auto)' }],
        'hi-Latn': [{ ext: 'vtt', url: `/api/subs/${videoId}/auto-hi-Latn.vtt`, name: 'Hindi (Latin, auto)' }],
      },
      playlist: null,
      _demo: true,
    };
  }

  function buildPlaylistInfo(parsed) {
    const entries = DEMO_PLAYLIST_IDS.map((id, i) => {
      const single = buildInfo({ ...parsed, type: 'video', videoId: id });
      return {
        ...single,
        id,
        title: `Demo playlist item ${i + 1}: pipeline test clip`,
        playlist_index: i + 1,
        duration: Math.max(3, config.demoSampleSeconds - (i % 3)),
      };
    });
    return {
      id: parsed.playlistId ?? 'PLdemoPlaylist0001',
      title: 'Demo playlist (5 videos)',
      _type: 'playlist',
      extractor: 'demo',
      playlist_count: entries.length,
      entries,
    };
  }

  /* ------------------------------------------------------------------ *
   * Provider API
   * ------------------------------------------------------------------ */
  async function probe(url, parsed) {
    await ensureDir(config.cacheDir);
    if (parsed.type === 'playlist') return buildPlaylistInfo(parsed);
    return buildInfo(parsed);
  }

  /* ---------------- media production ---------------- */
  async function produceVideo({ info, selection, dir, trim, onProgress, signal }) {
    const master = await ensureMaster();
    const targetHeight = selection.height ?? config.demoSampleHeight;
    const out = path.join(dir, `video-${targetHeight}p${trim ? `-trim-${trim.start}-${trim.end}` : ''}.mp4`);
    const needsScale = targetHeight !== config.demoSampleHeight;

    const args = ['-y', '-hide_banner', '-loglevel', 'error'];
    if (trim) args.push('-ss', String(trim.start));
    args.push('-i', master);
    if (trim) args.push('-t', String(Math.max(0.2, trim.end - trim.start)));
    if (needsScale) args.push('-vf', `scale=-2:${targetHeight}`);
    args.push(
      '-c:v', 'libx264', '-preset', config.ffmpegPreset, '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
      '-c:a', 'aac', '-b:a', '128k',
      '-progress', 'pipe:2',
      out,
    );
    await runWithProgress(args, { duration: info.duration, onProgress, signal, timeoutMs: config.jobTimeoutMs });
    return { file: out, height: targetHeight, width: Math.round((targetHeight * 16) / 9 / 2) * 2, kind: 'video' };
  }

  async function produceAudio({ info, selection, dir, trim, onProgress, signal }) {
    const master = await ensureMaster();
    const codec = selection.codec ?? 'mp3';
    const out = path.join(dir, `audio.${selection.ext}`);
    const bitrate = selection.bitrate ?? '192k';

    const args = ['-y', '-hide_banner', '-loglevel', 'error'];
    if (trim) args.push('-ss', String(trim.start));
    args.push('-i', master);
    if (trim) args.push('-t', String(Math.max(0.2, trim.end - trim.start)));
    args.push('-vn');
    if (codec === 'mp3') args.push('-c:a', 'libmp3lame', '-b:a', bitrate);
    else if (codec === 'm4a') args.push('-c:a', 'aac', '-b:a', bitrate);
    else if (codec === 'opus') args.push('-c:a', 'libopus', '-b:a', bitrate);
    else if (codec === 'wav') args.push('-c:a', 'pcm_s16le');
    else if (codec === 'flac') args.push('-c:a', 'flac');
    else args.push('-c:a', 'aac', '-b:a', bitrate);
    args.push('-progress', 'pipe:2', out);

    await runWithProgress(args, { duration: info.duration, onProgress, signal, timeoutMs: config.jobTimeoutMs });
    return { file: out, kind: 'audio', duration: trim ? trim.end - trim.start : info.duration };
  }

  async function produceSubtitle({ info, job, dir }) {
    const lang = job.subtitle?.lang ?? 'en';
    const auto = Boolean(job.subtitle?.auto);
    const out = path.join(dir, `subtitle-${lang}${auto ? '-auto' : ''}.srt`);
    await fsp.mkdir(dir, { recursive: true });
    await fsp.writeFile(out, buildSrt(info, lang, auto), 'utf8');
    return { file: out, kind: 'subtitle' };
  }

  async function produceThumbnail({ info, dir }) {
    const master = await ensureMaster();
    const out = path.join(dir, 'thumbnail.jpg');
    await runFfmpeg([
      '-y', '-hide_banner', '-loglevel', 'error',
      '-ss', '0.2', '-i', master, '-frames:v', '1', '-q:v', '3', out,
    ], { timeoutMs: 60_000 });
    return { file: out, kind: 'image' };
  }

  async function produceMetadata({ info, dir }) {
    const out = path.join(dir, 'metadata.json');
    await fsp.mkdir(dir, { recursive: true });
    await fsp.writeFile(out, JSON.stringify(info, null, 2), 'utf8');
    return { file: out, kind: 'data' };
  }

  /** Real thumbnail JPEGs for every offered size (cached per video). */
  async function thumbnailFile(videoId, thumbId) {
    const size = THUMB_SIZES.find((s) => s.id === thumbId) ?? THUMB_SIZES.at(-1);
    const dir = thumbDir(videoId);
    const out = path.join(dir, `${size.id}.jpg`);
    try {
      const stat = await fsp.stat(out);
      if (stat.size > 500) return out;
    } catch { /* generate */ }
    return once(`thumb:${out}`, async () => {
      try {
        const stat = await fsp.stat(out);
        if (stat.size > 500) return out;
      } catch { /* generate */ }
      const master = await ensureMaster();
      await ensureDir(dir);
      await runFfmpeg([
        '-y', '-hide_banner', '-loglevel', 'error',
        '-ss', '0.2', '-i', master, '-frames:v', '1',
        '-vf', `scale=${size.w}:${size.h}:force_original_aspect_ratio=decrease,pad=${size.w}:${size.h}:(ow-iw)/2:(oh-ih)/2`,
        '-q:v', '3', out,
      ], { timeoutMs: 60_000 });
      return out;
    });
  }

  function buildSrt(info, lang, auto) {
    const lines = {
      en: ['Welcome to this demo download', 'Subtitles are generated locally', 'Video and audio were merged with ffmpeg'],
      hi: ['इस डेमो डाउनलोड में आपका स्वागत है', 'सबटाइटल स्थानीय रूप से बनाए गए हैं', 'वीडियो और ऑडियो ffmpeg से जोड़े गए'],
      de: ['Willkommen beim Demo-Download', 'Untertitel werden lokal erzeugt', 'Video und Audio wurden mit ffmpeg zusammengeführt'],
    };
    const text = lines[lang] ?? lines.en;
    const total = Math.max(3, Math.min(info.duration || 6, 12));
    const per = total / text.length;
    const stamp = (s) => {
      const hh = String(Math.floor(s / 3600)).padStart(2, '0');
      const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
      const ss = String(Math.floor(s % 60)).padStart(2, '0');
      const ms = String(Math.round((s - Math.floor(s)) * 1000)).padStart(3, '0');
      return `${hh}:${mm}:${ss},${ms}`;
    };
    const blocks = text.map((line, i) => `${i + 1}\n${stamp(i * per)} --> ${stamp((i + 1) * per - 0.05)}\n${line}${auto ? ' [auto]' : ''}\n`);
    return `${blocks.join('\n')}`;
  }

  async function runWithProgress(args, { duration, onProgress, signal, timeoutMs }) {
    let buffer = '';
    let lastEmit = 0;
    await runFfmpeg(args, {
      timeoutMs,
      onStderr: (chunk) => {
        buffer += chunk;
        const idx = buffer.lastIndexOf('progress=');
        if (idx === -1) return;
        const slice = buffer.slice(0, idx + 9);
        buffer = buffer.slice(idx);
        const parsed = parseProgressLine(slice, { duration });
        const now = Date.now();
        if (parsed.percent != null && now - lastEmit > 150) {
          lastEmit = now;
          onProgress?.({ percent: Math.max(1, Math.min(99, parsed.percent)), stage: 'processing', speed: parsed.speed ?? null });
        }
      },
    });
    if (signal?.aborted) throw Object.assign(new Error('aborted'), { code: 'ABORTED' });
  }

  return {
    id: 'demo',
    probe,
    produceVideo,
    produceAudio,
    produceSubtitle,
    produceThumbnail,
    produceMetadata,
    thumbnailFile,
    buildSrt,
    _buildInfo: buildInfo,
    _thumbs: THUMB_SIZES,
    _humanDuration: humanDuration,
  };
}
