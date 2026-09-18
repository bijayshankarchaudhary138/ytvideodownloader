/**
 * Small, dependency-free helpers shared by the server and the tests.
 * Everything here is deliberately pure so it can be unit-tested.
 */
import crypto from 'node:crypto';
import path from 'node:path';

/* ------------------------------------------------------------------ *
 * Identifiers & hashing
 * ------------------------------------------------------------------ */
export function randomId(bytes = 8) {
  return crypto.randomBytes(bytes).toString('hex');
}

export function shortId() {
  // URL-/filename-safe id: 12 chars of base36
  return BigInt(`0x${crypto.randomBytes(8).toString('hex')}`).toString(36).padStart(12, '0').slice(0, 12);
}

export function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

/* ------------------------------------------------------------------ *
 * Filesystem safety
 * ------------------------------------------------------------------ */
const RESERVED_WINDOWS = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/**
 * Turn any video title into a filename that is safe on Linux, macOS *and*
 * Windows, while keeping unicode (Hindi, emoji, …) intact.
 */
export function sanitizeFilename(input, fallback = 'download') {
  let name = String(input ?? '');
  // Traversal attempts ("../../etc/passwd") are reduced to their basename; a
  // normal title that merely contains a slash keeps both parts, joined with "_"
  // so "Song / Official Video" stays readable.
  if (/(^|[/\\])\.\.([/\\]|$)/.test(name) || /^[/\\]/.test(name)) {
    name = name.split(/[/\\]/).filter((p) => p && p !== '..').pop() ?? '';
  }
  // control characters → underscore
  name = name.replace(/[\u0000-\u001f\u007f]/g, '_');
  // any remaining separators join the name instead of creating directories
  name = name.replace(/[/\\]/g, '_');
  // illegal-on-windows characters
  name = name.replace(/[<>:"|?*]/g, '_');
  // collapse underscore runs (control chars produce multiples)
  name = name.replace(/_{2,}/g, '_');
  // no leading dots (hidden files / ".."), no trailing dots or spaces
  name = name.replace(/^[.\s]+/, '').replace(/[.\s]+$/, '');
  name = name.trim();
  if (!name) return fallback;

  const ext = path.extname(name);
  let base = ext ? name.slice(0, -ext.length) : name;
  if (RESERVED_WINDOWS.test(base)) base = `_${base}`;
  const maxBase = Math.max(1, 200 - ext.length);
  if (base.length > maxBase) base = base.slice(0, maxBase);
  const result = `${base}${ext}`;
  return result || fallback;
}

/** Join paths but refuse anything that escapes `base` (path traversal guard). */
export function safeJoin(base, ...parts) {
  const decoded = parts.map((p) => {
    let s = String(p ?? '');
    try { s = decodeURIComponent(s); } catch { /* keep raw */ }
    return s;
  });
  if (decoded.some((p) => !p || p.includes('\u0000'))) throw new Error('invalid path segment');
  const resolved = path.resolve(base, ...decoded);
  const baseResolved = path.resolve(base);
  if (resolved !== baseResolved && !resolved.startsWith(baseResolved + path.sep)) {
    throw new Error('path traversal detected');
  }
  return resolved;
}

export function slugify(input) {
  const s = String(input ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return s || 'file';
}

/** `a.mp4` + existing → `a (1).mp4`, `a (2).mp4`, … */
export function uniqueName(name, existing = []) {
  const taken = new Set(existing.map((n) => String(n).toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;
  const ext = path.extname(name);
  const base = ext ? name.slice(0, -ext.length) : name;
  for (let i = 1; i < 10_000; i++) {
    const candidate = `${base} (${i})${ext}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `${base}-${shortId()}${ext}`;
}

/* ------------------------------------------------------------------ *
 * Network safety (SSRF)
 * ------------------------------------------------------------------ */
const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^0\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^\[?::1\]?$/,
  /^\[?fe80:/i,
  /^\[?fc00:/i,
  /^\[?fd[0-9a-f]{2}:/i,
  /\.local$/i,
  /\.internal$/i,
  /^metadata\./i,
  /^metadata$/i,
];

export function isPrivateHost(hostname) {
  const host = String(hostname ?? '').trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) return true;
  return PRIVATE_HOST_PATTERNS.some((re) => re.test(host));
}

/* ------------------------------------------------------------------ *
 * Numbers, sizes, ranges
 * ------------------------------------------------------------------ */
export function clamp(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

export function parseSizeLimit(input) {
  if (input === undefined || input === null || input === '') return null;
  if (typeof input === 'number') return input;
  const m = String(input).trim().match(/^([\d.]+)\s*(b|kb|mb|gb|tb|k|m|g|t)?$/i);
  if (!m) return null;
  const mult = { b: 1, k: 1024, kb: 1024, m: 1024 ** 2, mb: 1024 ** 2, g: 1024 ** 3, gb: 1024 ** 3, t: 1024 ** 4, tb: 1024 ** 4 };
  return Math.round(Number(m[1]) * (mult[(m[2] || 'b').toLowerCase()] ?? 1));
}

/**
 * Parse an HTTP Range header.
 * @returns {null} when there is no/!invalid range, 'unsatisfiable' when the
 *          range cannot be served, or {start,end} inclusive.
 */
export function parseRange(header, size) {
  if (!header || typeof header !== 'string') return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null;
  const [, rawStart, rawEnd] = m;
  if (rawStart === '' && rawEnd === '') return null;
  let start;
  let end;
  if (rawStart === '') {
    const suffix = Number(rawEnd);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === '' ? size - 1 : Number(rawEnd);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start >= size) return 'unsatisfiable';
  end = Math.min(end, size - 1);
  if (end < start) return 'unsatisfiable';
  return { start, end };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Human readable byte size (binary units, but familiar labels). */
export function humanBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = n / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

export function takeFirstErrorCode(err) {
  return err?.code && typeof err.code === 'string' && /^[A-Z_]+$/.test(err.code) ? err.code : null;
}
