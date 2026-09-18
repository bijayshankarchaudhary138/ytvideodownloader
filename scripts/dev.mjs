#!/usr/bin/env node
/**
 * One command that gives you the whole app in development:
 *
 *   1. boots the Express API  (default :8080)  — /api/*
 *   2. boots the Vite dev server (default :5173) with React HMR
 *   3. proxies /api from Vite to Express, so the browser only ever talks to
 *      one origin (this is what makes the hosted preview work: the preview
 *      proxy forwards port 5173 and the API calls ride along).
 *
 * Usage:
 *   npm run dev                     # auto mode: demo clips unless yt-dlp works
 *   npm run dev -- --live           # always use the real yt-dlp engine
 *   npm run dev -- --demo           # always use the bundled sample media
 *   npm run dev -- --port 9000 --web-port 4000
 */
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../server/src/config.js';
import { createApp } from '../server/src/http/app.js';
import { createLogger } from '../server/src/core/logger.js';
import { ytdlpVersion } from '../server/src/core/engine.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const logger = createLogger('dev');

function parseArgs(argv) {
  const out = { apiPort: null, webPort: null, mode: null, host: '0.0.0.0' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--port' || arg === '-p') { out.apiPort = Number(next); i += 1; }
    else if (arg === '--web-port') { out.webPort = Number(next); i += 1; }
    else if (arg === '--host') { out.host = next; i += 1; }
    else if (arg === '--live') out.mode = 'off';
    else if (arg === '--demo') out.mode = 'on';
    else if (arg === '--auto') out.mode = 'auto';
  }
  return out;
}

/** Pick a free port so two dev servers can coexist. */
function freePort(preferred) {
  return new Promise((resolve, reject) => {
    const probe = http.createServer();
    probe.once('error', () => {
      if (preferred) reject(new Error(`port ${preferred} is already in use`));
      else resolve(0);
    });
    probe.listen(preferred ?? 0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

const args = parseArgs(process.argv.slice(2));
const apiPort = args.apiPort ?? Number(process.env.PORT ?? 8080);
const webPortPreferred = args.webPort ?? Number(process.env.WEB_PORT ?? 5173);

const config = loadConfig({
  port: apiPort,
  host: args.host,
  ...(args.mode ? { demoMode: args.mode } : {}),
});

const { app, services } = createApp({ config });
const server = app.listen(config.port, config.host);
await new Promise((resolve, reject) => {
  server.once('listening', resolve);
  server.once('error', (err) => reject(new Error(`API server could not bind ${config.host}:${config.port} — ${err.message}`)));
});
server.keepAliveTimeout = 65_000;

const webPort = await freePort(webPortPreferred).catch((err) => {
  throw err;
});

// Make sure the Vite config proxies to the API port we actually bound.
process.env.API_PROXY_TARGET = `http://127.0.0.1:${config.port}`;

const { createServer } = await import('vite');
const vite = await createServer({
  configFile: path.join(ROOT, 'web', 'vite.config.js'),
  server: {
    host: '0.0.0.0',
    port: webPort,
    strictPort: true,
    allowedHosts: true,
    proxy: {
      '/api': { target: `http://127.0.0.1:${config.port}`, changeOrigin: true, ws: false },
    },
  },
  logLevel: 'info',
  clearScreen: false,
});
await vite.listen();

const ytdlp = await ytdlpVersion().catch(() => null);
const mode = config.demoMode === 'off' ? 'live (yt-dlp)' : config.demoMode === 'on' ? 'demo (sample media)' : 'auto';
const distHint = fs.existsSync(path.join(ROOT, 'web', 'dist')) ? '' : '  (npm run build for the production bundle)';

logger.info(`app      http://localhost:${webPort}${distHint}`);
logger.info(`api      http://localhost:${config.port}/api/health`);
logger.info(`docs     http://localhost:${webPort}/api/openapi.json`);
logger.info(`engine   mode=${mode}  yt-dlp=${ytdlp ?? 'unavailable'}  ffmpeg=${path.relative(ROOT, path.join(config.vendorDir, 'bin', 'ffmpeg'))}`);
if (config.demoMode === 'on') logger.info('demo mode is ON — downloads use a locally generated clip, no network needed.');

let closing = false;
async function shutdown(signal) {
  if (closing) return;
  closing = true;
  logger.info(`${signal} received, shutting down…`);
  const force = setTimeout(() => process.exit(1), 8000);
  force.unref?.();
  await vite.close().catch(() => {});
  await new Promise((resolve) => server.close(resolve));
  await services.shutdown().catch(() => {});
  clearTimeout(force);
  process.exit(0);
}

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => shutdown(signal));
process.on('unhandledRejection', (err) => logger.error('unhandled rejection:', err));
