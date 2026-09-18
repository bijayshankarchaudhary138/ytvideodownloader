#!/usr/bin/env node
/**
 * setup-binaries.mjs
 * ----------------------------------------------------------------------------
 * Makes the repo self-contained by fetching the two external engines we need:
 *
 *   1. yt-dlp   (the extraction engine)      -> vendor/yt_dlp
 *   2. ffmpeg   (mux / transcode / trim)     -> vendor/bin/ffmpeg
 *
 * Both are downloaded from PyPI (works in restricted networks, no GitHub
 * Releases CDN needed) and unpacked into ./vendor which is git-ignored so the
 * repository stays small.
 *
 * Idiomatic usage:
 *   npm run setup
 *
 * Environment:
 *   VENDOR_DIR   override target directory (default: <repo>/vendor)
 *   SKIP_FFMPEG=1 / SKIP_YTDLP=1 to skip one of them
 */
import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import zlib from 'node:zlib';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const VENDOR = process.env.VENDOR_DIR || path.join(ROOT, 'vendor');

const log = (...a) => console.log('[setup-binaries]', ...a);

/* ------------------------------------------------------------------ *
 * Minimal ZIP reader (no external deps, supports store + deflate)
 * ------------------------------------------------------------------ */
/**
 * Read a ZIP archive.
 * @param {Buffer} buf
 * @param {{inflate?: boolean}} options - by default `entry.data` is the
 *        decompressed content (pass inflate:false to get the raw stream).
 */
function readZipEntries(buf, { inflate = true } = {}) {
  const entries = [];
  // locate End Of Central Directory
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd === -1) throw new Error('not a zip archive (EOCD not found)');
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) break;
    const method = buf.readUInt16LE(off + 10);
    const compSize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const localOff = buf.readUInt32LE(off + 42);
    const name = buf.toString('utf8', off + 46, off + 46 + nameLen);
    entries.push({ name, method, compSize, localOff });
    off += 46 + nameLen + extraLen + commentLen;
  }
  for (const e of entries) {
    if (buf.readUInt32LE(e.localOff) !== 0x04034b50) throw new Error('bad local header');
    const nameLen = buf.readUInt16LE(e.localOff + 26);
    const extraLen = buf.readUInt16LE(e.localOff + 28);
    const start = e.localOff + 30 + nameLen + extraLen;
    e.raw = buf.subarray(start, start + e.compSize);
    e.data = inflate && e.method === 8 ? zlib.inflateRawSync(e.raw) : e.raw;
  }
  return entries;
}

async function unzipBuffer(buf, targetDir, filter = () => true) {
  const entries = readZipEntries(buf); // `data` is already decompressed
  let n = 0;
  for (const e of entries) {
    if (e.name.endsWith('/')) continue;
    if (!filter(e.name)) continue;
    const out = path.join(targetDir, e.name);
    if (!path.resolve(out).startsWith(path.resolve(targetDir))) continue; // zip-slip guard
    await fs.mkdir(path.dirname(out), { recursive: true });
    await fs.writeFile(out, e.data);
    n++;
  }
  return n;
}

/* ------------------------------------------------------------------ *
 * Download helpers
 * ------------------------------------------------------------------ */
async function fetchBuffer(url, { retries = 3 } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { redirect: 'follow' });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 700 * attempt));
    }
  }
  throw lastErr;
}

/** Query the PyPI JSON API for the newest wheel matching a platform tag. */
async function pypiWheel(pkg, tagPreference = []) {
  const meta = JSON.parse((await fetchBuffer(`https://pypi.org/pypi/${pkg}/json`)).toString('utf8'));
  const files = meta.urls || [];
  const wheels = files.filter((f) => f.filename?.endsWith('.whl'));
  const sdist = files.filter((f) => f.filename?.endsWith('.tar.gz'));
  for (const tag of tagPreference) {
    const hit = wheels.find((f) => f.filename.includes(tag));
    if (hit) return { url: hit.url, filename: hit.filename, version: meta.info.version };
  }
  const any = wheels[0] || sdist[0];
  if (!any) throw new Error(`no distribution found for ${pkg}`);
  return { url: any.url, filename: any.filename, version: meta.info.version };
}

/* ------------------------------------------------------------------ *
 * yt-dlp
 * ------------------------------------------------------------------ */
export async function installYtDlp({ force = false } = {}) {
  const target = path.join(VENDOR, 'yt_dlp');
  const stamp = path.join(VENDOR, '.ytdlp-version');
  if (!force && (await exists(path.join(target, '__init__.py')))) {
    const v = (await fs.readFile(stamp, 'utf8').catch(() => 'unknown')).trim();
    return { installed: true, skipped: true, version: v, dir: target };
  }
  log('fetching yt-dlp from PyPI ...');
  const dist = await pypiWheel('yt-dlp');
  const zip = await fetchBuffer(dist.url);
  await fs.rm(target, { recursive: true, force: true });
  await fs.mkdir(target, { recursive: true });
  const n = await unzipBuffer(zip, target, (name) => name.startsWith('yt_dlp/') && name.endsWith('.py'));
  // Flatten: wheel stores files under "yt_dlp/..."
  const nested = path.join(target, 'yt_dlp');
  if (await exists(nested)) {
    for (const f of await fs.readdir(nested)) {
      await fs.rename(path.join(nested, f), path.join(target, f)).catch(async () => {
        await fs.cp(path.join(nested, f), path.join(target, f), { recursive: true });
      });
    }
    await fs.rm(nested, { recursive: true, force: true });
  }
  await fs.writeFile(stamp, dist.version);
  log(`yt-dlp ${dist.version} installed (${n} modules) -> ${target}`);
  return { installed: true, skipped: false, version: dist.version, dir: target };
}

/* ------------------------------------------------------------------ *
 * ffmpeg (static build shipped inside the imageio-ffmpeg wheel)
 * ------------------------------------------------------------------ */
export async function installFfmpeg({ force = false } = {}) {
  const binDir = path.join(VENDOR, 'bin');
  const ffmpeg = path.join(binDir, 'ffmpeg');
  const ffprobe = path.join(binDir, 'ffprobe');
  if (!force && (await exists(ffmpeg))) {
    // Make sure the ffprobe shim is present even when ffmpeg was installed earlier.
    await installFfprobeShim({ binDir, ffprobe, exists });
    return { installed: true, skipped: true, path: ffmpeg };
  }
  log('fetching static ffmpeg from PyPI (imageio-ffmpeg) ...');
  const dist = await pypiWheel('imageio-ffmpeg', [
    `manylinux2014_${process.arch === 'arm64' ? 'aarch64' : 'x86_64'}`,
    'manylinux',
  ]);
  const zip = await fetchBuffer(dist.url);
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ffmpeg-'));
  await unzipBuffer(zip, tmp, (name) => name.includes('/binaries/ffmpeg-'));
  const found = (await walk(tmp)).find((f) => path.basename(f).startsWith('ffmpeg-'));
  if (!found) throw new Error('ffmpeg binary not found inside wheel');
  await fs.mkdir(binDir, { recursive: true });
  await fs.copyFile(found, ffmpeg);
  await fs.chmod(ffmpeg, 0o755);
  await fs.rm(tmp, { recursive: true, force: true });
  await installFfprobeShim({ binDir, ffprobe, exists });
  log(`ffmpeg installed -> ${ffmpeg}`);
  return { installed: true, skipped: false, path: ffmpeg, version: dist.version };
}

/**
 * The imageio-ffmpeg wheel ships ffmpeg only — no ffprobe — and a renamed copy
 * of ffmpeg does not behave like ffprobe. yt-dlp, however, needs a real ffprobe
 * during audio post-processing, so we install a small shim that implements the
 * ffprobe CLI on top of `ffmpeg -i` (see scripts/ffprobe-shim.mjs).
 */
async function installFfprobeShim({ binDir, ffprobe, exists }) {
  const shimSource = path.join(ROOT, 'scripts', 'ffprobe-shim.mjs');
  if (!(await exists(shimSource))) return false;
  const already = await exists(ffprobe);
  if (already) {
    const content = await fs.readFile(ffprobe, 'utf8').catch(() => '');
    if (content.includes('ffprobe-shim')) return true;
  }
  await fs.mkdir(binDir, { recursive: true });
  await fs.copyFile(shimSource, ffprobe);
  await fs.chmod(ffprobe, 0o755);
  log('installed ffprobe shim ->', ffprobe);
  await fs.writeFile(
    path.join(binDir, 'README.txt'),
    [
      'Bundled media binaries (git-ignored, installed with `npm run setup`):',
      '  ffmpeg  — static build from the imageio-ffmpeg wheel on PyPI',
      '  ffprobe — a shim (scripts/ffprobe-shim.mjs) that answers the ffprobe CLI',
      '            by parsing `ffmpeg -i` output; the ffmpeg project ships ffprobe',
      '            as a separate binary and it is not present in the wheel.',
      'Set FFPROBE_PATH to use a native ffprobe instead.',
      '',
    ].join('\n'),
  );
  return true;
}

async function walk(dir) {
  const out = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

/* ------------------------------------------------------------------ *
 * CLI
 * ------------------------------------------------------------------ */
async function main() {
  const force = process.argv.includes('--force');
  await fs.mkdir(VENDOR, { recursive: true });
  const result = {};
  if (process.env.SKIP_YTDLP !== '1') {
    try { result.ytdlp = await installYtDlp({ force }); }
    catch (err) { result.ytdlp = { installed: false, error: err.message }; log('yt-dlp FAILED:', err.message); }
  }
  if (process.env.SKIP_FFMPEG !== '1') {
    try { result.ffmpeg = await installFfmpeg({ force }); }
    catch (err) { result.ffmpeg = { installed: false, error: err.message }; log('ffmpeg FAILED:', err.message); }
  }
  await fs.writeFile(
    path.join(VENDOR, 'manifest.json'),
    JSON.stringify({ ...result, generatedAt: new Date().toISOString() }, null, 2),
  );
  log('done:', JSON.stringify(result, null, 2));
  return result;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error('[setup-binaries] fatal:', err);
    // Never break `npm install` / CI because of a network hiccup: the app
    // degrades to demo mode instead.
    process.exit(process.env.STRICT_SETUP === '1' ? 1 : 0);
  });
}

export { fetchBuffer, readZipEntries, unzipBuffer, pypiWheel, VENDOR, ROOT };
export const _internals = { crypto };
