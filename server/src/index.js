#!/usr/bin/env node
/**
 * Server entry point.
 *   npm start            → production-ish server (serves the built SPA + API)
 *   PORT=8080 npm start
 */
import { loadConfig } from './config.js';
import { createApp } from './http/app.js';
import { createLogger } from './core/logger.js';

const config = loadConfig();
const logger = createLogger('server');
const { app, services } = createApp({ config });

const server = app.listen(config.port, config.host, () => {
  const mode = config.demoMode === 'off' ? 'live (yt-dlp)' : config.demoMode === 'on' ? 'demo (local sample media)' : 'auto';
  logger.info(`listening on http://${config.host}:${config.port}  [mode: ${mode}]`);
  logger.info(`data dir: ${config.dataDir} · files expire after ${Math.round(config.ttlMs / 3600_000)}h`);
  if (config.demoMode !== 'off') {
    logger.info('DEMO_MODE is on: downloads are served from a locally generated sample clip (set DEMO_MODE=off for YouTube).');
  }
});

server.keepAliveTimeout = 65_000;
server.headersTimeout = 70_000;

let closing = false;
async function shutdown(signal) {
  if (closing) return;
  closing = true;
  logger.info(`${signal} received, shutting down…`);
  const force = setTimeout(() => process.exit(1), 8000);
  force.unref?.();
  await new Promise((resolve) => server.close(resolve));
  await services.shutdown();
  clearTimeout(force);
  process.exit(0);
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => shutdown(signal));
}
process.on('unhandledRejection', (err) => logger.error('unhandled rejection:', err));
process.on('uncaughtException', (err) => {
  logger.error('uncaught exception:', err);
  shutdown('uncaughtException');
});
