/**
 * Format catalogue + preset selection.
 *
 * This module is the reason our site can honestly offer 1080p/1440p/4K:
 * YouTube only serves those resolutions as *separate* video-only and
 * audio-only streams, so the catalogue marks them `needsMux` and the download
 * engine asks ffmpeg to merge them. Most competitor sites either hide those
 * formats or silently hand the user the 360p combined stream.
 */
import { humanBytes } from './util.js';

/* ------------------------------------------------------------------ *
 * Presets (what the UI shows)
 * ------------------------------------------------------------------ */
export const PRESETS = [
  { id: 'best', label: 'Best quality', kind: 'video', ext: 'mp4', icon: 'star', note: 'Highest resolution with audio' },
  { id: 'mp4-4320', label: '8K MP4', kind: 'video', ext: 'mp4', height: 4320, icon: 'video' },
  { id: 'mp4-2160', label: '4K MP4', kind: 'video', ext: 'mp4', height: 2160, icon: 'video' },
  { id: 'mp4-1440', label: '1440p MP4', kind: 'video', ext: 'mp4', height: 1440, icon: 'video' },
  { id: 'mp4-1080', label: '1080p MP4', kind: 'video', ext: 'mp4', height: 1080, icon: 'video', popular: true },
  { id: 'mp4-720', label: '720p MP4', kind: 'video', ext: 'mp4', height: 720, icon: 'video' },
  { id: 'mp4-480', label: '480p MP4', kind: 'video', ext: 'mp4', height: 480, icon: 'video' },
  { id: 'mp4-360', label: '360p MP4', kind: 'video', ext: 'mp4', height: 360, icon: 'video' },
  { id: 'mp4-240', label: '240p MP4', kind: 'video', ext: 'mp4', height: 240, icon: 'video' },
  { id: 'mp3-320', label: 'MP3 320 kbps', kind: 'audio', ext: 'mp3', codec: 'mp3', bitrate: '320k', icon: 'audio', popular: true },
  { id: 'mp3-192', label: 'MP3 192 kbps', kind: 'audio', ext: 'mp3', codec: 'mp3', bitrate: '192k', icon: 'audio' },
  { id: 'mp3-128', label: 'MP3 128 kbps', kind: 'audio', ext: 'mp3', codec: 'mp3', bitrate: '128k', icon: 'audio' },
  { id: 'm4a', label: 'M4A (AAC)', kind: 'audio', ext: 'm4a', codec: 'm4a', bitrate: '192k', icon: 'audio' },
  { id: 'opus', label: 'OPUS', kind: 'audio', ext: 'opus', codec: 'opus', bitrate: '160k', icon: 'audio' },
  { id: 'wav', label: 'WAV (lossless)', kind: 'audio', ext: 'wav', codec: 'wav', icon: 'audio' },
  { id: 'flac', label: 'FLAC (lossless)', kind: 'audio', ext: 'flac', codec: 'flac', icon: 'audio' },
  { id: 'subtitle-srt', label: 'Subtitles (.srt)', kind: 'subtitle', ext: 'srt', icon: 'subtitles' },
  { id: 'thumbnail-max', label: 'Thumbnail (max res)', kind: 'image', ext: 'jpg', icon: 'image' },
  { id: 'metadata-json', label: 'Metadata (.json)', kind: 'data', ext: 'json', icon: 'json' },
];

const PRESET_BY_ID = new Map(PRESETS.map((p) => [p.id, p]));

export function resolvePreset(id) {
  if (typeof id !== 'string') return null;
  return PRESET_BY_ID.get(id.trim()) ?? null;
}

export function requiredPreset(id) {
  const preset = resolvePreset(id);
  if (!preset) {
    const err = new Error(`Unknown preset: ${id}`);
    err.code = 'INVALID_PRESET';
    throw err;
  }
  return preset;
}

/* ------------------------------------------------------------------ *
 * Human formatting helpers
 * ------------------------------------------------------------------ */
export function qualityLabel(height) {
  const h = Number(height) || 0;
  if (h >= 4320) return '8K';
  if (h >= 2160) return '4K';
  if (h > 0) return `${h}p`;
  return 'audio';
}

export function estimateSize(format, durationSeconds = 0) {
  if (!format) return null;
  if (Number.isFinite(format.filesize) && format.filesize > 0) return format.filesize;
  if (Number.isFinite(format.filesize_approx) && format.filesize_approx > 0) return format.filesize_approx;
  const tbr = Number(format.tbr) || Number(format.abr) || 0;
  if (tbr > 0 && durationSeconds > 0) return Math.round((tbr * 1000 * durationSeconds) / 8);
  return null;
}

export function humanDuration(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

export function humanCount(n) {
  const v = Number(n) || 0;
  if (v < 1000) return String(v);
  if (v < 1_000_000) return `${(v / 1000).toFixed(1)}K`;
  if (v < 1_000_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  return `${(v / 1_000_000_000).toFixed(1)}B`;
}

export { humanBytes };

export function sortFormats(list) {
  return [...list].sort((a, b) => (b.height ?? 0) - (a.height ?? 0) || (b.tbr ?? 0) - (a.tbr ?? 0));
}

export function sanitizeTrim(trim, durationSeconds) {
  if (!trim || typeof trim !== 'object') return null;
  const start = Number(trim.start);
  const end = Number(trim.end);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  const duration = Number(durationSeconds) || 0;
  const max = duration > 0 ? duration : Number.MAX_SAFE_INTEGER;
  const s = Math.min(Math.max(0, start), max);
  const e = Math.min(Math.max(0, end), max);
  if (!(e > s)) return null;
  return { start: round3(s), end: round3(e) };
}

const round3 = (n) => Math.round(n * 1000) / 1000;

/* ------------------------------------------------------------------ *
 * Catalogue
 * ------------------------------------------------------------------ */
function classify(format) {
  const vcodec = format.vcodec ?? null;
  const acodec = format.acodec ?? null;
  const hasVideo = vcodec && vcodec !== 'none';
  const hasAudio = acodec && acodec !== 'none';
  const isStoryboard = format.ext === 'mhtml' || (vcodec === 'none' && acodec === 'none');
  if (isStoryboard) return 'skip';
  if (hasVideo && hasAudio) return 'combined';
  if (hasVideo) return 'video';
  if (hasAudio) return 'audio';
  // Unknown codecs (e.g. yt-dlp's generic extractor on a direct file URL):
  // treat as combined so "best" still works.
  return 'combined';
}

function toVideoEntry(f, duration) {
  const size = estimateSize(f, duration);
  return {
    id: String(f.format_id),
    label: qualityLabel(f.height),
    heightLabel: f.height ? `${f.height}p` : 'video',
    height: f.height ?? null,
    width: f.width ?? null,
    fps: f.fps ?? null,
    ext: f.ext,
    vcodec: f.vcodec ?? null,
    acodec: f.acodec ?? null,
    tbr: f.tbr ?? null,
    size,
    sizeText: humanBytes(size),
    sizeApprox: !(Number.isFinite(f.filesize) && f.filesize > 0),
    hdr: f.dynamic_range && f.dynamic_range !== 'SDR' ? f.dynamic_range : null,
    needsMux: true,
    protocol: f.protocol ?? null,
  };
}

function toAudioEntry(f, duration) {
  const size = estimateSize(f, duration);
  return {
    id: String(f.format_id),
    label: f.abr ? `${Math.round(f.abr)} kbps` : 'audio',
    abr: f.abr ?? null,
    asr: f.asr ?? null,
    ext: f.ext,
    acodec: f.acodec ?? null,
    size,
    sizeText: humanBytes(size),
    needsMux: false,
    protocol: f.protocol ?? null,
  };
}

function toCombinedEntry(f, duration) {
  const size = estimateSize(f, duration);
  return {
    id: String(f.format_id),
    label: f.height ? qualityLabel(f.height) : 'video',
    heightLabel: f.height ? `${f.height}p` : 'video',
    height: f.height ?? null,
    width: f.width ?? null,
    fps: f.fps ?? null,
    ext: f.ext,
    vcodec: f.vcodec ?? null,
    acodec: f.acodec ?? null,
    tbr: f.tbr ?? null,
    size,
    sizeText: humanBytes(size),
    sizeApprox: !(Number.isFinite(f.filesize) && f.filesize > 0),
    needsMux: false,
    protocol: f.protocol ?? null,
  };
}

function formatUploadDate(value) {
  const raw = String(value ?? '');
  if (/^\d{8}$/.test(raw)) return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  return raw || null;
}

export function buildSubtitleList(info = {}) {
  const out = [];
  for (const [lang, tracks] of Object.entries(info.subtitles ?? {})) {
    const track = Array.isArray(tracks) ? tracks[0] : tracks;
    if (!track) continue;
    out.push({ lang, label: track.name || lang, auto: false, ext: track.ext || 'vtt', url: track.url ?? null });
  }
  for (const [lang, tracks] of Object.entries(info.automatic_captions ?? {})) {
    const track = Array.isArray(tracks) ? tracks[0] : tracks;
    if (!track) continue;
    out.push({ lang, label: track.name || lang, auto: true, ext: track.ext || 'vtt', url: track.url ?? null });
  }
  return out;
}

export function buildFormatCatalog(info = {}) {
  const duration = Number(info.duration) || 0;
  const rawFormats = Array.isArray(info.formats) ? info.formats : [];

  const video = [];
  const audio = [];
  const combined = [];
  const seenVideoHeights = new Map();

  for (const f of rawFormats) {
    const bucket = classify(f);
    if (bucket === 'skip') continue;
    if (bucket === 'video') {
      const entry = toVideoEntry(f, duration);
      const key = entry.height ?? `x-${entry.id}`;
      const prev = seenVideoHeights.get(key);
      // keep the best bitrate (and prefer mp4/h264 for device compatibility)
      if (!prev || scoreVideo(entry) > scoreVideo(prev)) seenVideoHeights.set(key, entry);
    } else if (bucket === 'audio') {
      audio.push(toAudioEntry(f, duration));
    } else {
      combined.push(toCombinedEntry(f, duration));
    }
  }
  video.push(...seenVideoHeights.values());

  const thumbnails = (Array.isArray(info.thumbnails) ? info.thumbnails : [])
    .filter((t) => t && t.url)
    .map((t, i) => ({
      id: t.id || `thumb-${i}`,
      url: t.url,
      width: t.width ?? null,
      height: t.height ?? null,
      label: t.width ? `${t.width}×${t.height ?? ''}`.replace(/×$/, '') : (t.id || `thumb-${i}`),
    }))
    .sort((a, b) => (a.width ?? 0) - (b.width ?? 0));

  return {
    meta: {
      id: info.id ?? null,
      title: info.title ?? null,
      channel: info.uploader ?? info.channel ?? null,
      channelId: info.channel_id ?? null,
      channelUrl: info.channel_url ?? (info.channel_id ? `https://www.youtube.com/channel/${info.channel_id}` : null),
      duration,
      durationText: humanDuration(duration),
      viewCount: info.view_count ?? null,
      viewCountText: info.view_count ? humanCount(info.view_count) : null,
      likeCount: info.like_count ?? null,
      uploadDate: formatUploadDate(info.upload_date),
      description: info.description ? String(info.description).slice(0, 5000) : null,
      thumbnail: info.thumbnail ?? thumbnails.at(-1)?.url ?? null,
      webpageUrl: info.webpage_url ?? info.original_url ?? null,
      isLive: Boolean(info.is_live),
      wasLive: Boolean(info.was_live),
      extractor: info.extractor ?? null,
      ageLimit: info.age_limit ?? 0,
      categories: info.categories ?? [],
      tags: (info.tags ?? []).slice(0, 20),
      language: info.language ?? null,
    },
    video: sortFormats(video),
    audio: audio.sort((a, b) => (b.abr ?? 0) - (a.abr ?? 0)),
    combined: combined.sort((a, b) => (b.height ?? 0) - (a.height ?? 0)),
    chapters: (info.chapters ?? []).map((c) => ({
      title: c.title ?? 'Chapter',
      startTime: Number(c.start_time) || 0,
      endTime: Number(c.end_time) || 0,
    })),
    subtitles: {
      manual: buildSubtitleList({ subtitles: info.subtitles }).sort((a, b) => a.lang.localeCompare(b.lang)),
      auto: buildSubtitleList({ automatic_captions: info.automatic_captions }).sort((a, b) => a.lang.localeCompare(b.lang)),
    },
    thumbnails,
  };
}

/** Prefer higher bitrate; tie-break towards mp4/h264 (plays everywhere). */
function scoreVideo(entry) {
  const codecBonus = /^(avc|h264)/i.test(String(entry.vcodec || '')) ? 5_000 : /vp9|vp0?9/i.test(String(entry.vcodec || '')) ? 1_000 : 0;
  const containerBonus = entry.ext === 'mp4' ? 500 : 0;
  return (entry.tbr ?? 0) * 1000 + codecBonus + containerBonus;
}

/* ------------------------------------------------------------------ *
 * Preset → concrete yt-dlp selection
 * ------------------------------------------------------------------ */
const AUDIO_SOURCE_ORDER = ['m4a', 'webm', 'mp4', 'opus', 'aac', 'mp3', 'ogg', 'wav'];

function bestAudioId(audio) {
  if (!audio.length) return null;
  const sorted = [...audio].sort((a, b) => {
    const ia = AUDIO_SOURCE_ORDER.indexOf(a.ext);
    const ib = AUDIO_SOURCE_ORDER.indexOf(b.ext);
    if (ia !== ib) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return (b.abr ?? 0) - (a.abr ?? 0);
  });
  return sorted[0].id;
}

function pickVideo(video, wantedHeight) {
  if (!video.length) return null;
  if (!wantedHeight) return video[0];
  const exact = video.find((v) => v.height === wantedHeight);
  if (exact) return exact;
  const below = video.filter((v) => (v.height ?? 0) <= wantedHeight);
  if (below.length) return below[0]; // already sorted desc
  return video.at(-1); // smallest available, never fail
}

/**
 * @returns {{
 *   preset: object, kind: string, format: string, merge: boolean, needsMux: boolean,
 *   ext: string, mergeOutputFormat?: string, height?: number, width?: number, quality?: string,
 *   audioOnly?: boolean, codec?: string, bitrate?: string, fallbackFrom?: number
 * }}
 */
export function selectFormatForPreset(catalog, presetId) {
  const preset = requiredPreset(presetId);

  if (preset.kind === 'subtitle') {
    return { preset, kind: 'subtitle', format: 'bestaudio/best', merge: false, needsMux: false, ext: 'srt', audioOnly: false };
  }
  if (preset.kind === 'image' || preset.kind === 'data') {
    return { preset, kind: preset.kind, format: 'best', merge: false, needsMux: false, ext: preset.ext, audioOnly: false };
  }

  if (preset.kind === 'audio') {
    const audioId = bestAudioId(catalog.audio ?? []);
    const fallbackCombined = (catalog.combined ?? [])[0]?.id ?? (catalog.video ?? [])[0]?.id ?? 'best';
    const needsTranscode = !['m4a'].includes(preset.codec);
    return {
      preset,
      kind: 'audio',
      format: audioId ? String(audioId) : fallbackCombined,
      merge: false,
      needsMux: false,
      audioOnly: true,
      ext: preset.ext,
      codec: preset.codec,
      bitrate: preset.bitrate ?? null,
      transcode: needsTranscode,
    };
  }

  // video
  const wantedDistance = preset.id === 'best' ? null : (preset.height ?? null);
  const chosen = pickVideo(catalog.video ?? [], wantedDistance);

  if (!chosen) {
    // no separate video streams: fall back to the best progressive file
    const fallback = (catalog.combined ?? [])[0] ?? (catalog.audio ?? [])[0] ?? null;
    if (!fallback) {
      const err = new Error('No downloadable formats found for this video.');
      err.code = 'FORMAT_UNAVAILABLE';
      throw err;
    }
    return {
      preset,
      kind: 'video',
      format: preset.id === 'best' ? 'best' : String(fallback.id),
      merge: false,
      needsMux: false,
      ext: preset.ext === 'mp4' ? fallback.ext || 'mp4' : preset.ext,
      height: fallback.height ?? null,
      width: fallback.width ?? null,
      quality: fallback.height ? qualityLabel(fallback.height) : 'best',
      fallbackFrom: wantedDistance && fallback.height && fallback.height !== wantedDistance ? wantedDistance : undefined,
    };
  }

  const audioId = bestAudioId(catalog.audio ?? []);
  const combined = (catalog.combined ?? []).find((c) => c.height === chosen.height);

  // If YouTube offers no audio-only stream we must use a progressive file.
  if (!audioId && combined) {
    return {
      preset,
      kind: 'video',
      format: String(combined.id),
      merge: false,
      needsMux: false,
      ext: 'mp4',
      height: combined.height ?? null,
      quality: combined.height ? qualityLabel(combined.height) : 'best',
      fallbackFrom: wantedDistance && combined.height !== wantedDistance ? wantedDistance : undefined,
    };
  }

  if (!audioId) {
    // video-only streams and no audio track at all (rare): download video only
    return {
      preset,
      kind: 'video',
      format: String(chosen.id),
      merge: false,
      needsMux: false,
      ext: preset.ext,
      height: chosen.height ?? null,
      quality: chosen.height ? qualityLabel(chosen.height) : 'best',
      videoOnly: true,
      fallbackFrom: wantedDistance && chosen.height !== wantedDistance ? wantedDistance : undefined,
    };
  }

  return {
    preset,
    kind: 'video',
    format: `${chosen.id}+${audioId}`,
    merge: true,
    needsMux: true,
    ext: 'mp4',
    mergeOutputFormat: 'mp4',
    height: chosen.height ?? null,
    width: chosen.width ?? null,
    quality: chosen.height ? qualityLabel(chosen.height) : 'best',
    audioFormatId: audioId,
    fallbackFrom: wantedDistance && chosen.height !== wantedDistance ? wantedDistance : undefined,
  };
}
