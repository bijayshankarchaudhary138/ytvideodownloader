#!/usr/bin/env node
/**
 * Generates the PNG icons + PWA screenshot referenced by
 * web/public/manifest.webmanifest.
 *
 * There is no image library (and no rasteriser for SVG) in this project, so the
 * artwork is drawn pixel by pixel here and encoded with a tiny, dependency-free
 * PNG writer built on node:zlib. Run `npm run icons` after editing the artwork.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'web', 'public', 'icons');

/* ------------------------------------------------------------------ canvas */

function createCanvas(width, height, background = [0, 0, 0, 0]) {
  const data = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    data[i * 4] = background[0];
    data[i * 4 + 1] = background[1];
    data[i * 4 + 2] = background[2];
    data[i * 4 + 3] = background[3];
  }
  return { width, height, data };
}

function blend(canvas, x, y, [r, g, b, a = 255]) {
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height || a === 0) return;
  const i = (y * canvas.width + x) * 4;
  const d = canvas.data;
  if (a === 255) {
    d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
    return;
  }
  const sa = a / 255;
  const da = d[i + 3] / 255;
  const outA = sa + da * (1 - sa);
  d[i] = Math.round((r * sa + d[i] * da * (1 - sa)) / (outA || 1));
  d[i + 1] = Math.round((g * sa + d[i + 1] * da * (1 - sa)) / (outA || 1));
  d[i + 2] = Math.round((b * sa + d[i + 2] * da * (1 - sa)) / (outA || 1));
  d[i + 3] = Math.round(outA * 255);
}

function fillRect(canvas, x, y, w, h, color) {
  const x0 = Math.round(x);
  const y0 = Math.round(y);
  for (let py = y0; py < y0 + Math.round(h); py += 1) {
    for (let px = x0; px < x0 + Math.round(w); px += 1) blend(canvas, px, py, color);
  }
}

function fillRoundRect(canvas, x, y, w, h, radius, colorFn) {
  const x0 = Math.round(x);
  const y0 = Math.round(y);
  const x1 = Math.round(x + w);
  const y1 = Math.round(y + h);
  const r = Math.min(radius, Math.floor(Math.min(w, h) / 2));
  for (let py = y0; py < y1; py += 1) {
    for (let px = x0; px < x1; px += 1) {
      // Rounded corners: skip pixels outside the corner circles.
      let inside = true;
      const cx = px < x0 + r ? x0 + r : px >= x1 - r ? x1 - r - 1 : px;
      const cy = py < y0 + r ? y0 + r : py >= y1 - r ? y1 - r - 1 : py;
      if (cx !== px || cy !== py) {
        const dx = px - cx;
        const dy = py - cy;
        if (dx * dx + dy * dy > r * r) inside = false;
      }
      if (inside) blend(canvas, px, py, colorFn(px, py));
    }
  }
}

function fillCircle(canvas, cx, cy, radius, color) {
  const r2 = radius * radius;
  for (let py = Math.floor(cy - radius); py <= Math.ceil(cy + radius); py += 1) {
    for (let px = Math.floor(cx - radius); px <= Math.ceil(cx + radius); px += 1) {
      const dx = px - cx;
      const dy = py - cy;
      if (dx * dx + dy * dy <= r2) blend(canvas, px, py, color);
    }
  }
}

function fillTriangle(canvas, p1, p2, p3, color) {
  const minX = Math.floor(Math.min(p1[0], p2[0], p3[0]));
  const maxX = Math.ceil(Math.max(p1[0], p2[0], p3[0]));
  const minY = Math.floor(Math.min(p1[1], p2[1], p3[1]));
  const maxY = Math.ceil(Math.max(p1[1], p2[1], p3[1]));
  const area = (p2[0] - p1[0]) * (p3[1] - p1[1]) - (p3[0] - p1[0]) * (p2[1] - p1[1]);
  if (area === 0) return;
  for (let py = minY; py <= maxY; py += 1) {
    for (let px = minX; px <= maxX; px += 1) {
      const w1 = ((p2[0] - p1[0]) * (py - p1[1]) - (px - p1[0]) * (p2[1] - p1[1])) / area;
      const w2 = ((px - p1[0]) * (p3[1] - p1[1]) - (p3[0] - p1[0]) * (py - p1[1])) / area;
      if (w1 >= -0.0001 && w2 >= -0.0001 && w1 + w2 <= 1.0001) blend(canvas, px, py, color);
    }
  }
}

/* --------------------------------------------------------------- 5x7 font */

const GLYPHS = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#...#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  0: ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  1: ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  2: ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  3: ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  4: ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  5: ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  6: ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  7: ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  8: ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  9: ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  ',': ['.....', '.....', '.....', '.....', '.##..', '.##..', '.#...'],
  ':': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.....'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  '/': ['....#', '...#.', '...#.', '..#..', '.#...', '.#...', '#....'],
  '%': ['##..#', '##.#.', '...#.', '..#..', '.#...', '#.##.', '#.##.'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
};

function drawText(canvas, text, x, y, { scale = 2, color = [255, 255, 255, 255], spacing = 1 } = {}) {
  let cursor = x;
  for (const rawChar of String(text).toUpperCase()) {
    const glyph = GLYPHS[rawChar] || GLYPHS[' '];
    for (let gy = 0; gy < glyph.length; gy += 1) {
      for (let gx = 0; gx < glyph[gy].length; gx += 1) {
        if (glyph[gy][gx] !== '#') continue;
        fillRect(canvas, cursor + gx * scale, y + gy * scale, scale, scale, color);
      }
    }
    cursor += (5 + spacing) * scale;
  }
  return cursor - x;
}

const textWidth = (text, scale = 2) => String(text).length * 6 * scale - scale;

/* ------------------------------------------------------------ PNG encoder */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, body) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length, 0);
  const typed = Buffer.concat([Buffer.from(type, 'latin1'), body]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed), 0);
  return Buffer.concat([length, typed, crc]);
}

function encodePng({ width, height, data }) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    data.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ----------------------------------------------------------------- brand */

const RED_TOP = [255, 74, 106, 255];
const RED_MID = [255, 0, 51, 255];
const RED_BOTTOM = [193, 0, 36, 255];
const INK = [11, 15, 25, 255];

/** Vertical two-stop gradient sampled per pixel, as a colour callback. */
function redGradient(height) {
  return (_x, y) => {
    const t = y / Math.max(1, height - 1);
    const from = t < 0.5 ? RED_TOP : RED_MID;
    const to = t < 0.5 ? RED_MID : RED_BOTTOM;
    const k = t < 0.5 ? t * 2 : (t - 0.5) * 2;
    return [
      Math.round(from[0] + (to[0] - from[0]) * k),
      Math.round(from[1] + (to[1] - from[1]) * k),
      Math.round(from[2] + (to[2] - from[2]) * k),
      255,
    ];
  };
}

/** Play triangle + download arrow, scaled to `size` and centred on (cx, cy). */
function drawLogo(canvas, cx, cy, size, color) {
  const s = size;
  const stroke = Math.max(2, Math.round(s * 0.085));
  // Play triangle (right-facing), sitting slightly left of centre.
  fillTriangle(
    canvas,
    [cx - s * 0.44, cy - s * 0.34],
    [cx - s * 0.44, cy + s * 0.34],
    [cx + s * 0.06, cy],
    color,
  );
  // Download arrow on the right: shaft, head, and the tray line below it.
  fillRect(canvas, cx + s * 0.26, cy - s * 0.36, stroke, s * 0.38, color);
  fillTriangle(
    canvas,
    [cx + s * 0.16, cy - s * 0.03],
    [cx + s * 0.36 + stroke * 1.4, cy - s * 0.03],
    [cx + s * 0.26 + stroke / 2, cy + s * 0.22],
    color,
  );
  fillRect(canvas, cx + s * 0.16, cy + s * 0.32, s * 0.27, stroke * 0.9, color);
}

function renderIcon(size, { maskable = false } = {}) {
  const canvas = createCanvas(size, size);
  const gradient = redGradient(size);
  if (maskable) {
    // Full bleed: the platform mask crops the corners for us.
    fillRect(canvas, 0, 0, size, size, [0, 0, 0, 0]);
    fillRoundRect(canvas, 0, 0, size, size, 0, gradient);
  } else {
    fillRoundRect(canvas, 0, 0, size, size, size * 0.2, gradient);
  }
  // Safe zone: maskable icons must keep the logo inside the central 80% circle.
  const logoSize = maskable ? size * 0.46 : size * 0.6;
  drawLogo(canvas, size / 2, size / 2, logoSize, [255, 255, 255, 255]);
  return canvas;
}

/** A 1280x720 product screenshot for the install prompt / store listing. */
function renderScreenshot(width = 1280, height = 720) {
  const canvas = createCanvas(width, height, INK);
  // App bar
  fillRect(canvas, 0, 0, width, 88, [15, 20, 33, 255]);
  const logo = renderIcon(48);
  for (let y = 0; y < logo.height; y += 1) {
    for (let x = 0; x < logo.width; x += 1) {
      const i = (y * logo.width + x) * 4;
      blend(canvas, 24 + x, 20 + y, [logo.data[i], logo.data[i + 1], logo.data[i + 2], logo.data[i + 3]]);
    }
  }
  drawText(canvas, 'YT DOWNLOAD', 88, 30, { scale: 4, color: [255, 255, 255, 255] });
  drawText(canvas, 'NO ADS  NO POPUPS  NO SIGN-UP', width - textWidth('NO ADS  NO POPUPS  NO SIGN-UP', 2) - 28, 38, {
    scale: 2,
    color: [255, 122, 143, 255],
  });

  // URL input + primary action
  fillRoundRect(canvas, 48, 128, width - 96, 84, 18, () => [24, 30, 46, 255]);
  drawText(canvas, 'HTTPS://WWW.YOUTUBE.COM/WATCH?V=...', 76, 156, { scale: 3, color: [148, 160, 182, 255] });
  fillRoundRect(canvas, 48, 236, 320, 76, 16, redGradient(76));
  drawText(canvas, 'ANALYSE', 128, 262, { scale: 3, color: [255, 255, 255, 255] });
  drawText(canvas, '1080P MP4   MP3 320   PLAYLIST ZIP   SUBTITLES', 392, 262, {
    scale: 2,
    color: [148, 160, 182, 255],
  });

  // Format table
  const rows = [
    ['1080P MP4  H264 + AAC', '61.0 MB', 'BEST QUALITY'],
    ['720P MP4  H264 + AAC', '24.3 MB', 'FAST'],
    ['480P MP4  H264 + AAC', '11.2 MB', 'SMALL'],
    ['MP3 320 KBPS  AUDIO', '7.2 MB', 'MUSIC'],
  ];
  const rowH = 64;
  const rowStep = 74;
  let y = 344;
  for (const [label, size, tag] of rows) {
    fillRoundRect(canvas, 48, y, width - 96, rowH, 14, () => [20, 25, 39, 255]);
    drawText(canvas, label, 76, y + 16, { scale: 3, color: [235, 241, 255, 255] });
    drawText(canvas, tag, 76 + textWidth(label, 3) + 28, y + 22, { scale: 2, color: [106, 118, 142, 255] });
    drawText(canvas, size, 900, y + 18, { scale: 3, color: [148, 160, 182, 255] });
    fillRoundRect(canvas, 1048, y + 12, 184, 40, 12, redGradient(40));
    drawText(canvas, 'DOWNLOAD', 1048 + (184 - textWidth('DOWNLOAD', 2)) / 2, y + 22, {
      scale: 2,
      color: [255, 255, 255, 255],
    });
    y += rowStep;
  }

  // Live progress card
  fillRoundRect(canvas, 48, y + 4, width - 96, 52, 14, () => [16, 21, 34, 255]);
  fillRoundRect(canvas, 68, y + 24, 520, 14, 7, () => [32, 38, 56, 255]);
  fillRoundRect(canvas, 68, y + 24, 318, 14, 7, redGradient(14));
  drawText(canvas, '61%   4.8 MB/S   ETA 00:07   SSE LIVE PROGRESS', 640, y + 21, {
    scale: 2,
    color: [255, 122, 143, 255],
  });
  return canvas;
}

/* ------------------------------------------------------------------- main */

export async function generateIcons({ dir = OUT_DIR } = {}) {
  await fs.mkdir(dir, { recursive: true });
  const files = [
    ['icon-192.png', renderIcon(192)],
    ['icon-512.png', renderIcon(512)],
    ['icon-maskable-512.png', renderIcon(512, { maskable: true })],
    ['screenshot-wide.png', renderScreenshot()],
  ];
  const written = [];
  for (const [name, canvas] of files) {
    const target = path.join(dir, name);
    await fs.writeFile(target, encodePng(canvas));
    written.push({ name, target, bytes: (await fs.stat(target)).size });
  }
  return written;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const written = await generateIcons({ dir: process.argv[2] ? path.resolve(process.argv[2]) : OUT_DIR });
  for (const file of written) {
    console.log(`icon  ${path.relative(ROOT, file.target)}  ${(file.bytes / 1024).toFixed(1)} KB`);
  }
}
