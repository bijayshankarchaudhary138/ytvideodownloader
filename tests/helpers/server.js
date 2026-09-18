/**
 * Test helpers: boot a real HTTP server with a throw-away data directory,
 * plus small utilities for polling jobs and downloading files.
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export async function makeTempDir(prefix = 'ytvd-test-') {
  return await fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

export async function startTestServer(overrides = {}) {
  const { createApp } = await import('@server/http/app.js');
  const { loadConfig } = await import('@server/config.js');
  const dataDir = await makeTempDir();
  const config = loadConfig({
    dataDir,
    demoMode: 'on',
    host: '127.0.0.1',
    port: 0,
    ...overrides,
  });
  const { app, services } = createApp({ config });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  return {
    baseUrl,
    config,
    services,
    dataDir,
    async close() {
      await services?.shutdown?.();
      await new Promise((r) => server.close(r));
      await fs.rm(dataDir, { recursive: true, force: true });
    },
  };
}

export async function api(baseUrl, pathname, init = {}) {
  const res = await fetch(`${baseUrl}${pathname}`, {
    headers: { 'content-type': 'application/json', ...(init.headers || {}) },
    ...init,
    body: init.body && typeof init.body !== 'string' ? JSON.stringify(init.body) : init.body,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { res, status: res.status, json, text, headers: res.headers };
}

export const DEMO_URL = 'https://www.youtube.com/watch?v=demoBukkTub';
export const DEMO_PLAYLIST_URL = 'https://www.youtube.com/playlist?list=PLdemoPlaylist0001';

/**
 * GET over a raw http.request: the fetch spec forbids overriding the `Host`
 * header, but multi-tenant / SEO behaviour depends on it, so tests need it.
 */
export async function rawGet(baseUrl, pathname = '/', { host, headers = {} } = {}) {
  const { request } = await import('node:http');
  const url = new URL(baseUrl);
  return await new Promise((resolve, reject) => {
    const req = request(
      {
        hostname: url.hostname,
        port: url.port,
        path: pathname,
        method: 'GET',
        headers: { ...(host ? { host } : {}), ...headers },
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
      },
    );
    req.on('error', reject);
    req.end();
  });
}

export async function waitForJob(baseUrl, jobId, { until = ['ready'], timeoutMs = 120_000 } = {}) {
  const wanted = Array.isArray(until) ? until : [until];
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    const { json } = await api(baseUrl, `/api/jobs/${jobId}`);
    last = json?.job || json;
    if (last && wanted.includes(last.status)) return last;
    if (last && ['failed', 'canceled'].includes(last.status) && !wanted.includes(last.status)) {
      throw new Error(`job ${jobId} ended as ${last.status}: ${JSON.stringify(last.error)}`);
    }
    await sleep(150);
  }
  throw new Error(`timeout waiting for job ${jobId} to reach ${wanted}; last=${JSON.stringify(last)}`);
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Download a file over HTTP into a temp path and return { bytes, sha256, file } */
export async function downloadToTemp(url, { dir, name } = {}) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed ${res.status}: ${await res.text().catch(() => '')}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const targetDir = dir || (await makeTempDir('ytvd-dl-'));
  const file = path.join(targetDir, name || decodeURIComponent(new URL(url).pathname.split('/').pop()));
  await fs.writeFile(file, buf);
  const { createHash } = await import('node:crypto');
  return { bytes: buf, sha256: createHash('sha256').update(buf).digest('hex'), file, dir: targetDir, res };
}

export async function openSse(baseUrl, pathname = '/api/events') {
  const controller = new AbortController();
  const res = await fetch(`${baseUrl}${pathname}`, {
    headers: { accept: 'text/event-stream' },
    signal: controller.signal,
  });
  const events = [];
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const pump = (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buffer.indexOf('\n\n')) !== -1) {
          const chunk = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const ev = { event: 'message', data: null };
          for (const line of chunk.split('\n')) {
            if (line.startsWith('event:')) ev.event = line.slice(6).trim();
            else if (line.startsWith('data:')) {
              const raw = line.slice(5).trim();
              try { ev.data = JSON.parse(raw); } catch { ev.data = raw; }
            }
          }
          events.push(ev);
        }
      }
    } catch { /* aborted */ }
  })();
  return {
    events,
    res,
    async close() { controller.abort(); await pump.catch(() => {}); },
    async waitFor(predicate, timeoutMs = 60_000) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const hit = events.find(predicate);
        if (hit) return hit;
        await sleep(100);
      }
      throw new Error(`SSE waitFor timed out; got ${events.length} events`);
    },
  };
}
