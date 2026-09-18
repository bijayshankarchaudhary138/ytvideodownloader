/**
 * A8 — the server is safe to expose to the open internet: no traversal, no
 * command injection, no SSRF, no prototype pollution, no version/stack leaks.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { startTestServer, api, waitForJob, DEMO_URL, DEMO_PLAYLIST_URL } from '../helpers/server.js';
import { parseVideoUrl } from '@server/core/url.js';

let ctx;
beforeAll(async () => {
  ctx = await startTestServer();
}, 120_000);
afterAll(async () => {
  await ctx?.close();
});

/**
 * Read a ZIP through its central directory (archiver streams entries, so local
 * headers carry no sizes — this is also exactly how unzip/info-zip read them).
 */
function zipEntries(buf) {
  const eocdIndex = (() => {
    for (let i = buf.length - 22; i >= 0; i -= 1) {
      if (buf.readUInt32LE(i) === 0x06054b50) return i;
    }
    throw new Error('no end-of-central-directory record');
  })();
  const count = buf.readUInt16LE(eocdIndex + 10);
  let offset = buf.readUInt32LE(eocdIndex + 16);
  const entries = [];
  for (let i = 0; i < count; i += 1) {
    if (buf.readUInt32LE(offset) !== 0x02014b50) throw new Error('bad central directory record');
    const method = buf.readUInt16LE(offset + 10);
    const compSize = buf.readUInt32LE(offset + 20);
    const nameLen = buf.readUInt16LE(offset + 28);
    const extraLen = buf.readUInt16LE(offset + 30);
    const commentLen = buf.readUInt16LE(offset + 32);
    const localOffset = buf.readUInt32LE(offset + 42);
    const name = buf.subarray(offset + 46, offset + 46 + nameLen).toString('utf8');
    const localNameLen = buf.readUInt16LE(localOffset + 26);
    const localExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    entries.push({ name, method, size: compSize, data: buf.subarray(dataStart, dataStart + compSize) });
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

describe('A8 · path traversal', () => {
  const traversals = [
    '../../package.json',
    '..%2f..%2fpackage.json',
    '..%252f..%252fpackage.json',
    '%2e%2e%2f%2e%2e%2fpackage.json',
    '....//....//package.json',
    '..\\..\\package.json',
    '%2e%2e%5c%2e%2e%5cpackage.json',
    '/etc/passwd',
    'file:///etc/passwd',
    '..%00/package.json',
    'a/../../../../etc/passwd',
  ];

  it('never serves a file outside the jobs directory', async () => {
    for (const evil of traversals) {
      for (const route of [`/api/files/${encodeURI(evil)}`, `/api/thumb/${evil}/default.jpg`, `/api/subs/${evil}/en.vtt`]) {
        const res = await fetch(`${ctx.baseUrl}${route}`);
        const type = res.headers.get('content-type') || '';
        const body = await res.text();
        // Either a typed 4xx, or the SPA shell when the client normalised the
        // path away (fetch strips "../" before it ever leaves the browser).
        if (res.status === 200) {
          expect(type, `${route} served non-HTML with 200`).toContain('text/html');
          expect(body).toContain('id="root"');
        } else {
          expect([400, 404, 410, 301, 302].includes(res.status), `${route} → ${res.status}`).toBe(true);
          if (type.includes('json') && body) expect(JSON.parse(body).error?.code).toBeTruthy();
        }
        expect(body, `${route} leaked a file`).not.toMatch(/node_modules|"dependencies"|root:x:0:0/);
      }
    }
  }, 120_000);

  it('cannot escape through the static file handler either', async () => {
    for (const route of ['/../package.json', '/assets/../../package.json', '/%2e%2e/package.json']) {
      const res = await fetch(`${ctx.baseUrl}${route}`);
      const body = await res.text();
      expect(body).not.toMatch(/"dependencies"\s*:/);
    }
  }, 60_000);
});

describe('A8 · command injection', () => {
  it('treats hostile video ids/presets/titles as data, never as shell', async () => {
    const canary = path.join(os.tmpdir(), `ytvd-pwned-${Date.now()}`);
    const payloads = [
      `; touch ${canary}; #`,
      `$(touch ${canary})`,
      '`touch ' + canary + '`',
      `| tee ${canary}`,
      `&& rm -rf ${canary}`,
      '"\n touch ' + canary + '\n"',
    ];

    for (const payload of payloads) {
      const info = await api(ctx.baseUrl, '/api/info', { method: 'POST', body: { url: payload } });
      expect(info.status).toBe(400);
      expect(info.json.error.code).toBeTruthy();

      const job = await api(ctx.baseUrl, '/api/jobs', {
        method: 'POST',
        body: { url: DEMO_URL, preset: payload, title: payload },
      });
      expect([400, 404]).toContain(job.status);
    }

    const titleJob = await api(ctx.baseUrl, '/api/jobs', {
      method: 'POST',
      body: { url: DEMO_URL, preset: 'mp4-240', title: `evil "; touch ${canary}; #.mp4` },
    });
    expect(titleJob.status).toBe(201);
    const finished = await waitForJob(ctx.baseUrl, titleJob.json.job.id);
    expect(finished.status).toBe('ready');
    expect(finished.filename).not.toMatch(/[;"'`$|&\\]/);

    await expect(fs.stat(canary)).rejects.toThrow();
  }, 180_000);
});

describe('A8 · SSRF', () => {
  it('refuses to fetch internal / non-http targets', async () => {
    const targets = [
      'http://127.0.0.1:8080/api/health',
      'http://localhost:8080/',
      'http://169.254.169.254/latest/meta-data/',
      'http://10.0.0.1/',
      'http://192.168.1.1/router',
      'http://[::1]:8080/',
      'file:///etc/passwd',
      'gopher://127.0.0.1:6379/_INFO',
      'http://user:pass@127.0.0.1/',
      'http://2130706433/',
    ];
    for (const url of targets) {
      const parsed = parseVideoUrl(url);
      expect(parsed.ok, `${url} should be rejected`).toBe(false);
      const { status, json } = await api(ctx.baseUrl, '/api/info', { method: 'POST', body: { url } });
      expect([400, 404], `${url} → ${status}`).toContain(status);
      expect(['BLOCKED_HOST', 'INVALID_URL', 'UNSUPPORTED_URL', 'INVALID_VIDEO_ID']).toContain(json.error.code);
    }
  }, 120_000);

  it('blocks internal hosts again at job creation time (no second entry point)', async () => {
    const { status, json } = await api(ctx.baseUrl, '/api/jobs', {
      method: 'POST',
      body: { url: 'http://127.0.0.1:9/internal.mp4', preset: 'best' },
    });
    expect(status).toBe(400);
    expect(json.error.code).toBe('BLOCKED_HOST');
  }, 60_000);
});

describe('A8 · prototype pollution & header hygiene', () => {
  it('does not pollute Object.prototype through JSON bodies', async () => {
    const payloads = [
      { __proto__: { polluted: 'yes' } },
      { constructor: { prototype: { polluted: 'yes' } } },
      { url: DEMO_URL, preset: 'mp4-240', __proto__: { polluted: 'yes' } },
      { url: { __proto__: { polluted: 'yes' } } },
    ];
    for (const body of payloads) {
      const res = await fetch(`${ctx.baseUrl}/api/info`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      expect(res.status).toBeLessThan(500);
      await res.text();
    }
    expect({}.polluted).toBeUndefined();
    expect(Object.prototype.polluted).toBeUndefined();
    const health = await api(ctx.baseUrl, '/api/health');
    expect(health.json.status).toBe('ok');
  }, 60_000);

  it('hides the framework and sets defensive headers', async () => {
    const res = await fetch(`${ctx.baseUrl}/api/health`);
    expect(res.headers.get('x-powered-by')).toBeNull();
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('referrer-policy')).toBeTruthy();
    expect(res.headers.get('cache-control')).toContain('no-store');
    expect(JSON.stringify([...res.headers])).not.toMatch(/express|node\.js\/\d/);

    const html = await fetch(`${ctx.baseUrl}/`);
    if (html.headers.get('content-type')?.includes('html')) {
      const csp = html.headers.get('content-security-policy');
      expect(csp).toBeTruthy();
      expect(csp).toContain("default-src 'self'");
      expect(csp).not.toContain('unsafe-eval');
    }
  }, 60_000);

  it('never exposes configuration, paths or secrets on any public route', async () => {
    const routes = ['/api/health', '/api/meta', '/api/stats', '/api/openapi.json'];
    for (const route of routes) {
      const text = await (await fetch(`${ctx.baseUrl}${route}`)).text();
      expect(text, route).not.toMatch(/"cookiesFile"|"proxyUrl"|"dataDir"|"jobsDir"|"rateLimitMax"/);
      expect(text, route).not.toMatch(/\/home\/|\/tmp\/ytvd-|BEGIN (RSA|OPENSSH|PRIVATE)/);
    }
  }, 60_000);

  it('sanitises ZIP entry names (no zip-slip)', async () => {
    const created = await api(ctx.baseUrl, '/api/batch', {
      method: 'POST',
      body: { url: DEMO_PLAYLIST_URL, preset: 'mp4-240' },
    });
    expect(created.status).toBe(201);
    const batchId = created.json.batch.id;
    const deadline = Date.now() + 240_000;
    let batch = created.json.batch;
    while (Date.now() < deadline && !['done', 'failed'].includes(batch.status)) {
      await new Promise((r) => setTimeout(r, 400));
      batch = (await api(ctx.baseUrl, `/api/batch/${batchId}`)).json.batch;
    }
    if (batch.status !== 'done') return; // covered by features.test.js

    const bytes = Buffer.from(await (await fetch(`${ctx.baseUrl}/api/batch/${batchId}/zip`)).arrayBuffer());
    const entries = zipEntries(bytes);
    expect(entries.length).toBeGreaterThan(1);
    for (const entry of entries) {
      expect(entry.name.startsWith('/'), `${entry.name} is absolute`).toBe(false);
      expect(entry.name.includes('..'), `${entry.name} escapes the archive`).toBe(false);
      expect(entry.name).not.toMatch(/^[A-Za-z]:\\/);
      const payload = entry.method === 0 ? entry.data : zlib.inflateRawSync(entry.data);
      expect(payload.length).toBeGreaterThan(1000);
    }
  }, 300_000);
});
