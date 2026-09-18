#!/usr/bin/env node
/**
 * ffprobe-compatible shim.
 *
 * Why this exists: the static ffmpeg we bootstrap from PyPI ships *only*
 * ffmpeg — there is no ffprobe binary, and simply renaming ffmpeg does not work
 * (it rejects `-print_format`). yt-dlp, however, calls ffprobe during audio
 * post-processing to detect the codec of the downloaded file, and aborts with
 * "unable to obtain file audio codec with ffprobe" when it is missing.
 *
 * This shim implements the subset of the ffprobe CLI that yt-dlp (and our own
 * server) use, by parsing `ffmpeg -i <file>` output — which is instant, because
 * ffmpeg prints the container headers without decoding anything.
 *
 * Installed as <vendor>/bin/ffprobe by scripts/setup-binaries.mjs.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function ffmpegPath() {
  const candidates = [
    process.env.FFMPEG_PATH,
    path.join(__dirname, 'ffmpeg'),
    path.join(__dirname, '..', 'bin', 'ffmpeg'),
    '/usr/bin/ffmpeg',
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch { /* keep looking */ }
  }
  return 'ffmpeg';
}

function parseProbe(text) {
  const streams = [];
  const format = {};
  const input = text.match(/Input #0,\s*([^,]+(?:,[^,]+)*),\s*from '([^']+)'/);
  if (input) {
    format.format_name = input[1].trim();
    format.filename = input[2];
  }
  const duration = text.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (duration) {
    format.duration = String(Number(duration[1]) * 3600 + Number(duration[2]) * 60 + parseFloat(duration[3]));
  }
  const bitrate = text.match(/bitrate:\s*(\d+)\s*kb\/s/);
  if (bitrate) format.bit_rate = String(Number(bitrate[1]) * 1000);

  const blocks = text.split(/\n\s*Stream #/).slice(1);
  for (const [index, block] of blocks.entries()) {
    const header = block.split('\n')[0];
    const type = header.match(/:\s*(Video|Audio|Subtitle|Data|Attachment):/)?.[1]?.toLowerCase();
    if (!type) continue;
    const stream = {
      index,
      codec_type: type,
      codec_name: header.match(/(?:Video|Audio|Subtitle|Data|Attachment):\s*([A-Za-z0-9_]+)/)?.[1] ?? null,
    };
    const resolution = header.match(/(\d{2,5})x(\d{2,5})/);
    if (resolution && type === 'video') {
      stream.width = Number(resolution[1]);
      stream.height = Number(resolution[2]);
    }
    const kbps = [...header.matchAll(/(\d+)\s*kb\/s/g)];
    if (kbps.length) stream.bit_rate = String(Number(kbps.at(-1)[1]) * 1000);
    const hz = header.match(/(\d{3,6})\s*Hz/);
    if (hz) stream.sample_rate = String(Number(hz[1]));
    const channels = header.match(/,\s*(mono|stereo|[0-9]\.[0-9])\s*,/);
    if (channels) stream.channels = channels[1] === 'mono' ? 1 : channels[1] === 'stereo' ? 2 : Number(channels[1][0]) + 1;
    const fps = header.match(/([\d.]+)\s*fps/);
    if (fps) stream.r_frame_rate = `${Math.round(Number(fps[1]))}/1`;
    streams.push(stream);
  }
  return { streams, format };
}

function runFfmpegInfo(file) {
  return new Promise((resolve) => {
    const child = spawn(ffmpegPath(), ['-hide_banner', '-i', file], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('error', () => resolve(''));
    child.on('close', () => resolve(out));
  });
}

/* ------------------------------- CLI ---------------------------------- */
const argv = process.argv.slice(2);

if (argv.includes('-version') || argv.includes('-h') || argv.length === 0) {
  process.stdout.write('ffprobe version 7.0.2-shim (ffmpeg based) — bundled with ytvideodownloader\n');
  process.exit(0);
}

const jsonOut = argv.some((a) => a === '-print_format=json' || a === '-of=json'
  || ((a === '-print_format' || a === '-of') && argv[argv.indexOf(a) + 1] === 'json'));

const showEntries = (() => {
  const idx = argv.findIndex((a) => a === '-show_entries' || a.startsWith('-show_entries='));
  if (idx === -1) return null;
  return argv[idx].includes('=') ? argv[idx].split('=')[1] : argv[idx + 1];
})();

const file = [...argv].reverse().find((a) => !a.startsWith('-') && fs.existsSync(a));
if (!file) {
  process.stderr.write('ffprobe-shim: no readable input file given\n');
  process.exit(1);
}

const info = parseProbe(await runFfmpegInfo(file));
if (!info.streams.length && !info.format.duration) {
  process.stderr.write(`ffprobe-shim: could not read media information from ${file}\n`);
  process.exit(1);
}

if (jsonOut) {
  const payload = { streams: info.streams, format: info.format };
  if (showEntries && !showEntries.includes('stream')) payload.streams = [];
  if (showEntries && !showEntries.includes('format')) payload.format = {};
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  process.exit(0);
}

// default / key=value style output, as ffprobe does without -print_format
if (info.format.duration) process.stdout.write(`duration=${info.format.duration}\n`);
for (const stream of info.streams) {
  process.stdout.write(`codec_type=${stream.codec_type}\ncodec_name=${stream.codec_name ?? 'unknown'}\n`);
}
process.exit(0);
