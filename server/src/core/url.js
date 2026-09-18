/**
 * URL understanding: everything a user might paste, and everything an attacker
 * might paste. Pure functions, no network, fully unit-tested.
 */
import { isPrivateHost } from './util.js';

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
  'gaming.youtube.com',
]);

const SHORT_HOSTS = new Set(['youtu.be', 'www.youtu.be', 'yt.be']);

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const PLAYLIST_ID_RE = /^[A-Za-z0-9_-]{6,60}$/;

export function isYouTubeHost(hostname) {
  const host = String(hostname ?? '').toLowerCase();
  return YOUTUBE_HOSTS.has(host) || SHORT_HOSTS.has(host);
}

export function isBlockedHost(hostname) {
  return isPrivateHost(hostname);
}

export function canonicalWatchUrl(videoId) {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/* ------------------------------------------------------------------ *
 * Timestamp parsing
 * ------------------------------------------------------------------ */
export function parseTimestamp(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  const raw = String(value).trim().toLowerCase();
  if (!raw) return 0;
  if (/^\d+(\.\d+)?$/.test(raw)) return Math.floor(Number(raw));

  // 1h2m3s / 2m30s / 45s / 2m
  const hm = raw.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (hm && (hm[1] || hm[2] || hm[3])) {
    const [, h = 0, m = 0, s = 0] = hm;
    return Number(h) * 3600 + Number(m) * 60 + Number(s);
  }
  // 1:02:03 (h:m:s) or 2:30 (m:s)
  const colon = raw.match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/);
  if (colon) {
    const [, hoursPart, minutesPart, secondsPart] = colon;
    const seconds = Number(secondsPart);
    const minutes = Number(minutesPart);
    if (hoursPart !== undefined) {
      if (minutes > 59 || seconds > 59) return 0;
      return Number(hoursPart) * 3600 + minutes * 60 + seconds;
    }
    if (seconds > 59) return 0;
    return minutes * 60 + seconds;
  }
  return 0;
}

export function formatTimestamp(totalSeconds) {
  const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

/* ------------------------------------------------------------------ *
 * Main parser
 * ------------------------------------------------------------------ */
/**
 * @returns {{ok:true,type:'video'|'playlist'|'generic',source:string,kind:string,
 *            videoId:string|null,playlistId:string|null,startSeconds:number,url:string,host:string}}
 *        | {{ok:false,code:'INVALID_URL'|'BLOCKED_HOST'|'INVALID_VIDEO_ID',error:string}}
 */
export function parseVideoUrl(input, { allowPrivateHosts = false } = {}) {
  if (typeof input !== 'string' || !input.trim()) {
    return { ok: false, code: 'INVALID_URL', error: 'Please paste a video link.' };
  }
  const trimmed = input.trim();
  if (trimmed.length > 2048) {
    return { ok: false, code: 'INVALID_URL', error: 'That link is too long to be a video link.' };
  }

  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, code: 'INVALID_URL', error: 'That does not look like a link. Copy the address from your browser.' };
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    return { ok: false, code: 'INVALID_URL', error: 'Only http(s) links are supported.' };
  }
  // SSRF guard. `allowPrivateHosts` exists only for self-hosted setups that
  // deliberately download from an internal media server (and for our test-suite,
  // which serves a local origin instead of reaching YouTube).
  if (!allowPrivateHosts && isBlockedHost(url.hostname)) {
    return { ok: false, code: 'BLOCKED_HOST', error: 'Links to local or private addresses are not allowed.' };
  }

  const host = url.hostname.toLowerCase();
  const pathname = url.pathname.replace(/\/+$/, '') || '/';
  const segments = pathname.split('/').filter(Boolean);
  const startSeconds = parseTimestamp(
    url.searchParams.get('t') ?? url.searchParams.get('start') ?? url.searchParams.get('time_continue'),
  );
  const playlistId = url.searchParams.get('list') ?? url.searchParams.get('playlist_id') ?? null;

  if (isYouTubeHost(host)) {
    const source = host.includes('music.youtube') ? 'youtube-music' : 'youtube';
    let videoId = null;
    let kind = 'watch';

    if (SHORT_HOSTS.has(host)) {
      videoId = segments[0] ?? null;
      kind = 'short-link';
    } else if (pathname === '/watch') {
      videoId = url.searchParams.get('v');
      kind = 'watch';
    } else if (segments[0] === 'shorts') {
      videoId = segments[1] ?? null;
      kind = 'shorts';
    } else if (segments[0] === 'live') {
      videoId = segments[1] ?? null;
      kind = 'live';
    } else if (segments[0] === 'embed' || segments[0] === 'v' || segments[0] === 'e') {
      videoId = segments[1] ?? null;
      kind = 'embed';
    } else if (segments[0] === 'playlist') {
      if (!playlistId) return { ok: false, code: 'INVALID_URL', error: 'That playlist link has no playlist id.' };
      return { ok: true, type: 'playlist', source, kind: 'playlist', videoId: null, playlistId, startSeconds, url: trimmed, host };
    } else if (playlistId) {
      return { ok: true, type: 'playlist', source, kind: 'playlist', videoId: null, playlistId, startSeconds, url: trimmed, host };
    } else {
      return { ok: false, code: 'INVALID_URL', error: 'That YouTube link does not contain a video.' };
    }

    if (!videoId || !VIDEO_ID_RE.test(videoId)) {
      return { ok: false, code: 'INVALID_VIDEO_ID', error: 'That video id does not look valid.' };
    }
    if (playlistId && !PLAYLIST_ID_RE.test(playlistId)) {
      return { ok: false, code: 'INVALID_URL', error: 'That playlist id does not look valid.' };
    }
    return {
      ok: true,
      type: 'video',
      source,
      kind,
      videoId,
      playlistId: playlistId ?? null,
      startSeconds,
      url: trimmed,
      host,
      canonicalUrl: canonicalWatchUrl(videoId),
    };
  }

  // Non-YouTube: still accepted (yt-dlp supports 1000+ sites) but flagged.
  if (playlistId && !isYouTubeHost(host)) {
    return { ok: true, type: 'generic', source: 'generic', kind: 'generic', videoId: null, playlistId, startSeconds, url: trimmed, host };
  }
  return { ok: true, type: 'generic', source: 'generic', kind: 'generic', videoId: null, playlistId: null, startSeconds, url: trimmed, host };
}

/* ------------------------------------------------------------------ *
 * Bulk extraction (someone pastes a paragraph full of links)
 * ------------------------------------------------------------------ */
export function extractUrls(text, { max = 25 } = {}) {
  if (typeof text !== 'string' || !text.trim()) return [];
  const matches = text.match(/https?:\/\/[^\s<>"'`)\]]+/gi) ?? [];
  const seen = new Set();
  const out = [];
  for (const raw of matches) {
    const cleaned = raw.replace(/[.,;:!?]+$/, '').replace(/\)+$/, '');
    if (!cleaned) continue;
    const key = cleaned.toLowerCase().replace(/\/+$/, '');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
    if (out.length >= max) break;
  }
  return out;
}
