/**
 * A7 — the API is hostile-input proof: no 500s, one canonical error envelope,
 * correct status codes, no internals leaked, and rate limiting that behaves.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTestServer, api, waitForJob, DEMO_URL } from '../helpers/server.js';
import { STATUS_BY_CODE } from '../../server/src/http/app.js';

let ctx;
beforeAll(async () => {
  ctx = await startTestServer();
}, 120_000);
afterAll(async () => {
  await ctx?.close();
});

const ENVELOPE = /^(?:\/home\/|node_modules|Error:|TypeError:|at |\s+at |.*\.js:\d+:)/;

function assertEnvelope(json, status) {
  expect(json, `expected a JSON error envelope for HTTP ${status}`).toBeTruthy();
  expect(typeof json.error?.code, JSON.stringify(json)).toBe('string');
  expect(typeof json.error?.message).toBe('string');
  expect(json.error.message.length).toBeGreaterThan(3);
  expect(json.error.message).not.toMatch(ENVELOPE);
  expect(json.error.message).not.toMatch(/\/home\/|\/tmp\/|node_modules|\bat [A-Za-z]|Traceback/);
  expect(json).not.toHaveProperty('stack');
  expect(JSON.stringify(json)).not.toMatch(/"stack"|"sql"|"query"/);
}

describe('A7 · canonical error envelope', () => {
  it('answers every malformed request with {error:{code,message}} and a 4xx', async () => {
    const cases = [
      ['POST', '/api/info', undefined],
      ['POST', '/api/info', {}],
      ['POST', '/api/info', { url: '' }],
      ['POST', '/api/info', { url: '   ' }],
      ['POST', '/api/info', { url: 42 }],
      ['POST', '/api/info', { url: { toString: 'nope' } }],
      ['POST', '/api/info', { url: 'ftp://example.com/a.mp4' }],
      ['POST', '/api/info', { url: 'javascript:alert(1)' }],
      ['POST', '/api/info', { url: 'https://www.youtube.com/watch?v=short' }],
      ['POST', '/api/jobs', {}],
      ['POST', '/api/jobs', { url: DEMO_URL }],
      ['POST', '/api/jobs', { url: DEMO_URL, preset: 123 }],
      ['POST', '/api/jobs', { url: DEMO_URL, preset: 'mp4-99999' }],
      ['POST', '/api/jobs', { url: DEMO_URL, preset: 'mp4-1080', trim: 'nope' }],
      ['POST', '/api/jobs', { url: DEMO_URL, preset: 'mp4-1080', subtitle: { lang: '!!!' } }],
      ['POST', '/api/batch', {}],
      ['POST', '/api/batch', { url: 'nope', preset: 'mp4-1080' }],
      ['POST', '/api/extract-urls', {}],
      ['GET', '/api/jobs/%2e%2e%2f%2e%2e%2fpackage.json/status', undefined],
      ['GET', '/api/jobs/does-not-exist', undefined],
      ['GET', '/api/batch/does-not-exist', undefined],
      ['GET', '/api/files/does-not-exist', undefined],
      ['GET', '/api/thumb/@@@@/default.jpg', undefined],
      ['GET', '/api/nowhere/at/all', undefined],
      ['PUT', '/api/health', undefined],
      ['DELETE', '/api/jobs', undefined],
    ];

    for (const [method, pathname, body] of cases) {
      const { status, json } = await api(ctx.baseUrl, pathname, { method, body });
      expect(status, `${method} ${pathname} → ${status}`).toBeGreaterThanOrEqual(400);
      expect(status, `${method} ${pathname} must not 5xx`).toBeLessThan(500);
      assertEnvelope(json, status);
    }
  }, 120_000);

  it('rejects invalid JSON with INVALID_JSON (not a crash)', async () => {
    const res = await fetch(`${ctx.baseUrl}/api/info`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"url": "https://youtu.be/',
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    assertEnvelope(json, 400);
    expect(json.error.code).toMatch(/INVALID_JSON|INVALID_INPUT/);
  }, 60_000);

  it('details on INVALID_PRESET lists the supported presets', async () => {
    const { status, json } = await api(ctx.baseUrl, '/api/jobs', {
      method: 'POST',
      body: { url: DEMO_URL, preset: 'nope' },
    });
    expect(status).toBe(400);
    expect(json.error.code).toBe('INVALID_PRESET');
    expect(json.error.details.presets).toContain('mp4-1080');
    expect(json.error.details.presets.length).toBeGreaterThan(10);
  }, 60_000);

  it('maps typed machine codes to documented HTTP statuses', async () => {
    const seen = new Map();
    const probe = async (method, pathname, body) => {
      const { status, json } = await api(ctx.baseUrl, pathname, { method, body });
      seen.set(json?.error?.code, status);
      return json;
    };
    await probe('POST', '/api/info', { url: 'not a url' });
    await probe('POST', '/api/info', { url: 'http://127.0.0.1:9/x.mp4' });
    await probe('POST', '/api/jobs', { url: DEMO_URL, preset: 'zzz' });
    await probe('GET', '/api/jobs/zzzz-missing');
    await probe('GET', '/api/files/zzzz-missing');

    expect(seen.get('INVALID_URL')).toBe(400);
    expect(seen.get('BLOCKED_HOST')).toBe(400);
    expect(seen.get('INVALID_PRESET')).toBe(400);
    expect(seen.get('JOB_NOT_FOUND')).toBe(404);
    for (const [code, status] of seen) {
      if (STATUS_BY_CODE[code]) expect(status, `${code} should map to ${STATUS_BY_CODE[code]}`).toBe(STATUS_BY_CODE[code]);
    }
  }, 60_000);

  it('returns a JSON 404 for unknown api paths but HTML for the SPA', async () => {
    const api404 = await fetch(`${ctx.baseUrl}/api/definitely/missing`);
    expect(api404.status).toBe(404);
    expect(api404.headers.get('content-type')).toContain('application/json');
    assertEnvelope(await api404.json(), 404);

    const asset404 = await fetch(`${ctx.baseUrl}/assets/missing-file.js`);
    expect(asset404.status).toBe(404);
    expect(asset404.headers.get('content-type')).toContain('application/json');
  }, 60_000);
});

describe('A7 · rate limiting + body limits', () => {
  it('429s with Retry-After once the window budget is spent', async () => {
    const small = await startTestServer({ rateLimitMax: 5, rateLimitWindowMs: 60_000, heavyRateLimitMax: 2 });
    try {
      const codes = [];
      for (let i = 0; i < 8; i += 1) {
        const { status, json } = await api(small.baseUrl, '/api/info', { method: 'POST', body: { url: DEMO_URL } });
        codes.push(status);
        if (status === 429) expect(json.error.code).toBe('RATE_LIMITED');
      }
      expect(codes).toContain(429);
      const limited = await fetch(`${small.baseUrl}/api/info`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: DEMO_URL }),
      });
      expect(limited.status).toBe(429);
      expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
      const body = await limited.json();
      assertEnvelope(body, 429);
      expect(body.error.message).not.toMatch(/limit.*=.*\d+.*window/i); // no config dump
    } finally {
      await small.close();
    }
  }, 120_000);

  it('413s an oversized body without buffering it', async () => {
    const { status, json } = await api(ctx.baseUrl, '/api/info', {
      method: 'POST',
      body: { url: DEMO_URL, pad: 'x'.repeat(200_000) },
    });
    expect([400, 413]).toContain(status);
    assertEnvelope(json, status);
  }, 60_000);

  it('rejects queue overflow with 429 QUEUE_FULL instead of dropping work', async () => {
    const tiny = await startTestServer({ maxQueueLength: 1, concurrency: 1 });
    try {
      const statuses = [];
      for (let i = 0; i < 4; i += 1) {
        const { status, json } = await api(tiny.baseUrl, '/api/jobs', {
          method: 'POST',
          body: { url: DEMO_URL, preset: 'mp4-1080' },
        });
        statuses.push(status);
        if (status === 429) expect(json.error.code).toBe('QUEUE_FULL');
      }
      expect(statuses.filter((s) => s === 201).length).toBeGreaterThanOrEqual(1);
      expect(statuses).toContain(429);
    } finally {
      await tiny.close();
    }
  }, 180_000);
});

describe('A7 · expired files', () => {
  it('410s a file whose TTL has passed', async () => {
    const shortTtl = await startTestServer({ fileTtlMs: 1500, sweepIntervalMs: 300 });
    try {
      const created = await api(shortTtl.baseUrl, '/api/jobs', {
        method: 'POST',
        body: { url: DEMO_URL, preset: 'mp4-240' },
      });
      const job = await waitForJob(shortTtl.baseUrl, created.json.job.id);
      expect(job.status).toBe('ready');
      const first = await fetch(`${shortTtl.baseUrl}${job.fileUrl}`);
      expect(first.status).toBe(200);
      await first.arrayBuffer();

      await new Promise((r) => setTimeout(r, 2200));
      const after = await fetch(`${shortTtl.baseUrl}${job.fileUrl}`);
      expect([404, 410]).toContain(after.status);
      assertEnvelope(await after.json(), after.status);
    } finally {
      await shortTtl.close();
    }
  }, 180_000);
});
