/**
 * End-to-end test of the SHIPPED bundle — the production `web/dist` build is
 * booted inside jsdom against a live server and driven like a visitor would:
 * paste a YouTube link → Analyse → Download → follow the ready link → probe the
 * file with ffprobe.
 *
 * This is the test that catches "the preview looks alive but nothing happens":
 * it runs the real minified bundle (not the source) and, in the second case,
 * makes the SSE stream silent on purpose — a proxy that buffers or breaks
 * `text/event-stream` must not be able to freeze the UI.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startTestServer, DEMO_URL } from '../helpers/server.js';
import { probeMedia } from '@server/core/ffmpeg.js';

const execFileAsync = promisify(execFile);
const ROOT = process.cwd();

let ctx;
let dist;
let smokeScript;

beforeAll(async () => {
  // Build into a private directory: two test files building into web/dist at
  // the same time would race, and the shipped bundle must stay untouched.
  dist = await fs.mkdtemp(path.join(os.tmpdir(), 'ytvd-dist-'));
  await execFileAsync(
    process.execPath,
    [path.join(ROOT, 'node_modules/vite/bin/vite.js'), 'build', '--config', 'web/vite.config.js', '--outDir', dist, '--emptyOutDir'],
    { cwd: ROOT, maxBuffer: 20 * 1024 * 1024, env: { ...process.env, NODE_ENV: 'production' } },
  );
  smokeScript = path.join(ROOT, 'tests', 'helpers', 'bundle-smoke.mjs');
  ctx = await startTestServer();
}, 300_000);

afterAll(async () => {
  await ctx?.close();
  if (dist) await fs.rm(dist, { recursive: true, force: true });
});

async function runSmoke(extraArgs = [], { timeoutMs = 90_000 } = {}) {
  const { stdout } = await execFileAsync(
    process.execPath,
    [smokeScript, '--origin', ctx.baseUrl, '--dist', dist, '--url', DEMO_URL, ...extraArgs],
    { cwd: ROOT, maxBuffer: 20 * 1024 * 1024, timeout: timeoutMs },
  );
  const line = stdout.split('\n').find((l) => l.startsWith('__BUNDLE_SMOKE__'));
  if (!line) throw new Error(`harness printed no result: ${stdout.slice(0, 500)}`);
  return JSON.parse(line.slice('__BUNDLE_SMOKE__'.length));
}

describe('the shipped bundle boots and downloads', () => {
  it('mounts the app, renders formats, downloads a playable file', async () => {
    const r = await runSmoke();
    expect(r.error, JSON.stringify(r)).toBeNull();
    expect(r.mounted).toBe(true);
    expect(r.seoShellRemoved).toBe(true);
    expect(r.rows).toBeGreaterThan(0);
    expect(r.link).toMatch(/^\/api\/files\//);
    expect(r.fileStatus).toBe(200);
    expect(r.fileBytes).toBeGreaterThan(10_000);
    expect(r.consoleErrors, 'the bundle must boot without console errors').toEqual([]);
  }, 180_000);

  it('still finishes when the SSE stream is silent (buffering proxy)', async () => {
    const r = await runSmoke(['--silent-sse']);
    expect(r.error, JSON.stringify(r)).toBeNull();
    expect(r.rows).toBeGreaterThan(0);
    expect(r.link).toMatch(/^\/api\/files\//);
    expect(r.fileStatus).toBe(200);

    const { file, bytes } = await (async () => {
      const res = await fetch(`${ctx.baseUrl}${r.link}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const target = path.join(dist, 'smoke-download.mp4');
      await fs.writeFile(target, buf);
      return { file: target, bytes: buf.length };
    })();
    const info = await probeMedia(file);
    expect(bytes).toBeGreaterThan(10_000);
    expect(info.video.length).toBeGreaterThan(0);
  }, 180_000);
});
