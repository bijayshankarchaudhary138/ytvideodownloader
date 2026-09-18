import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTestServer, api, rawGet, DEMO_URL, sleep } from '../helpers/server.js';

let ctx;
beforeAll(async () => { ctx = await startTestServer(); }, 60_000);
afterAll(async () => { await ctx?.close(); });

const base = () => ctx.baseUrl;

describe('GET /api/health', () => {
  it('reports engine availability without leaking internals', async () => {
    const { status, json } = await api(base(), '/api/health');
    expect(status).toBe(200);
    expect(json.status).toBe('ok');
    expect(json.mode).toBe('demo');
    expect(json.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(typeof json.uptime).toBe('number');
    expect(json.engines.ffmpeg.available).toBe(true);
    expect(json.engines.ytdlp.available).toBe(true);
    expect(typeof json.engines.ytdlp.version).toBe('string');
    expect(JSON.stringify(json)).not.toMatch(/\/home\/|\/usr\/|node_modules/);
  });

  it('is fast (cold health check < 500ms)', async () => {
    const t0 = Date.now();
    await api(base(), '/api/health');
    expect(Date.now() - t0).toBeLessThan(500);
  });
});

describe('GET /api/meta', () => {
  it('exposes presets, limits, languages and features for the UI', async () => {
    const { status, json } = await api(base(), '/api/meta');
    expect(status).toBe(200);
    expect(json.presets.map((p) => p.id)).toContain('mp4-1080');
    expect(json.presets.map((p) => p.id)).toContain('mp3-320');
    expect(json.limits.maxBatchSize).toBeGreaterThan(0);
    expect(json.limits.maxPlaylistItems).toBeGreaterThan(0);
    expect(json.limits.ttlHours).toBeGreaterThan(0);
    expect(json.languages.map((l) => l.code)).toEqual(['en', 'hi']);
    expect(json.features).toMatchObject({
      playlist: true, subtitles: true, thumbnails: true, trim: true, metadata: true, api: true,
    });
    expect(json.version).toBeTruthy();
  });
});

describe('POST /api/info — video metadata + format catalogue', () => {
  it('returns full metadata and a usable format catalogue', async () => {
    const { status, json } = await api(base(), '/api/info', { method: 'POST', body: { url: DEMO_URL } });
    expect(status).toBe(200);
    expect(json.video.id).toBeTruthy();
    expect(json.video.title.length).toBeGreaterThan(2);
    // absolute CDN url in live mode, or a same-origin /api/thumb path in demo mode
    expect(json.video.thumbnail).toMatch(/^https?:\/\/|^\/api\//);
    expect(json.video.duration).toBeGreaterThan(0);
    expect(json.formats.video.length).toBeGreaterThan(2);
    expect(json.formats.audio.length).toBeGreaterThan(0);
    expect(json.formats.video[0].height).toBeGreaterThanOrEqual(720);
    expect(json.thumbnails.length).toBeGreaterThan(0);
    expect(Array.isArray(json.subtitles.manual)).toBe(true);
    expect(json.cached).toBe(false);
  });

  it('marks the second identical request as cached and answers much faster', async () => {
    const t1 = Date.now();
    await api(base(), '/api/info', { method: 'POST', body: { url: `${DEMO_URL}&t=33` } });
    const first = Date.now() - t1;
    const t2 = Date.now();
    const { json } = await api(base(), '/api/info', { method: 'POST', body: { url: `${DEMO_URL}&t=33` } });
    const second = Date.now() - t2;
    expect(json.cached).toBe(true);
    expect(second).toBeLessThanOrEqual(Math.max(first, 50));
  });

  it('rejects missing body / wrong types with a canonical error envelope', async () => {
    const missing = await api(base(), '/api/info', { method: 'POST', body: {} });
    expect(missing.status).toBe(400);
    expect(missing.json.error.code).toBe('INVALID_INPUT');
    expect(missing.json.error.message).toBeTruthy();

    const notJson = await api(base(), '/api/info', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{oops',
    });
    expect(notJson.status).toBe(400);
    expect(notJson.json.error.code).toBe('INVALID_JSON');
  });

  it('rejects non-URL and SSRF inputs', async () => {
    for (const [url, code] of [
      ['hello world', 'INVALID_URL'],
      ['http://localhost:9000/x', 'BLOCKED_HOST'],
      ['http://169.254.169.254/latest/meta-data', 'BLOCKED_HOST'],
      ['file:///etc/passwd', 'INVALID_URL'],
    ]) {
      const { status, json } = await api(base(), '/api/info', { method: 'POST', body: { url } });
      expect(status, url).toBe(400);
      expect(json.error.code, url).toBe(code);
    }
  });

  it('handles a playlist url by returning entries', async () => {
    const { status, json } = await api(base(), '/api/info', {
      method: 'POST', body: { url: 'https://www.youtube.com/playlist?list=PLdemoPlaylist0001' },
    });
    expect(status).toBe(200);
    expect(json.playlist).toBeTruthy();
    expect(json.playlist.entries.length).toBeGreaterThan(1);
    expect(json.playlist.entries[0].title).toBeTruthy();
  });

  it('caps the body size (413) and rate-limits abusive clients (429)', async () => {
    const huge = await api(base(), '/api/info', {
      method: 'POST', body: { url: DEMO_URL, junk: 'x'.repeat(300_000) },
    });
    expect([413, 400]).toContain(huge.status);

    const limited = await startTestServer({ rateLimitMax: 2, rateLimitWindowMs: 60_000 });
    try {
      await api(limited.baseUrl, '/api/health');
      await api(limited.baseUrl, '/api/health');
      const res = await fetch(`${limited.baseUrl}/api/health`);
      const body = await res.json().catch(() => ({}));
      expect(res.status).toBe(429);
      expect(res.headers.get('retry-after')).toBeTruthy();
      expect(body.error.code).toBe('RATE_LIMITED');
    } finally {
      await limited.close();
    }
  });
});

describe('jobs API — lifecycle', () => {
  let jobId;

  it('creates a job (201) with a queued public shape', async () => {
    const { status, json } = await api(base(), '/api/jobs', {
      method: 'POST', body: { url: DEMO_URL, preset: 'mp4-360', title: 'Test' },
    });
    expect(status).toBe(201);
    jobId = json.job.id;
    expect(json.job.status).toMatch(/queued|downloading|ready/);
    expect(json.job.preset).toBe('mp4-360');
    expect(json.job.progress.percent).toBeGreaterThanOrEqual(0);
    expect(json.job.expiresAt).toBeGreaterThan(Date.now());
  });

  it('validates the preset', async () => {
    const { status, json } = await api(base(), '/api/jobs', {
      method: 'POST', body: { url: DEMO_URL, preset: 'mp420-ultra' },
    });
    expect(status).toBe(400);
    expect(json.error.code).toBe('INVALID_PRESET');
    expect(json.error.details?.presets?.length).toBeGreaterThan(5);
  });

  it('reads a job back and lists jobs with stats', async () => {
    const one = await api(base(), `/api/jobs/${jobId}`);
    expect(one.status).toBe(200);
    expect(one.json.job.id).toBe(jobId);
    const listed = await api(base(), '/api/jobs');
    expect(listed.json.jobs.some((j) => j.id === jobId)).toBe(true);
    expect(listed.json.stats.total).toBeGreaterThan(0);
  });

  it('404s on an unknown job and rejects a path-traversal id', async () => {
    const missing = await api(base(), '/api/jobs/deadbeefdeadbeef');
    expect(missing.status).toBe(404);
    expect(missing.json.error.code).toBe('JOB_NOT_FOUND');
    const weird = await api(base(), '/api/jobs/..%2f..%2fetc%2fpasswd');
    expect([400, 404]).toContain(weird.status);
  });

  it('cancels and deletes a job', async () => {
    const created = await api(base(), '/api/jobs', { method: 'POST', body: { url: DEMO_URL, preset: 'mp4-1080' } });
    const id = created.json.job.id;
    const canceled = await api(base(), `/api/jobs/${id}/cancel`, { method: 'POST' });
    expect([200, 202, 409]).toContain(canceled.status);
    const deleted = await api(base(), `/api/jobs/${id}`, { method: 'DELETE' });
    expect([200, 204]).toContain(deleted.status);
    const gone = await api(base(), `/api/jobs/${id}`);
    expect(gone.status).toBe(404);
  });

  it('supports retry on a failed/deleted job with a sane error', async () => {
    const retry = await api(base(), '/api/jobs/nonexistent123456/retry', { method: 'POST' });
    expect(retry.status).toBe(404);
    expect(retry.json.error.code).toBe('JOB_NOT_FOUND');
  });
});

describe('static + SEO + docs routes', () => {
  it('serves robots.txt with a sitemap pointer and no Disallow of the site', async () => {
    const res = await fetch(`${base()}/robots.txt`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('Sitemap:');
    expect(text).toContain('User-agent: *');
    expect(text).not.toMatch(/Disallow: \/$/m);
  });

  it('serves a sitemap.xml with the main pages', async () => {
    const res = await fetch(`${base()}/sitemap.xml`);
    expect(res.status).toBe(200);
    const xml = await res.text();
    expect(xml).toContain('<urlset');
    for (const p of ['/', '/how-to', '/faq', '/api-docs', '/privacy']) {
      expect(xml, p).toContain(p);
    }
  });

  it('serves a web app manifest and a service worker', async () => {
    const manifest = await fetch(`${base()}/manifest.webmanifest`);
    expect(manifest.status).toBe(200);
    const m = await manifest.json();
    expect(m.name).toBeTruthy();
    expect(m.start_url).toBeTruthy();
    expect(m.icons.length).toBeGreaterThan(0);
    expect(m.display).toBe('standalone');

    const sw = await fetch(`${base()}/sw.js`);
    expect(sw.status).toBe(200);
    expect(await sw.text()).toContain('caches');
  });

  it('publishes an OpenAPI document describing every public endpoint', async () => {
    const res = await fetch(`${base()}/api/openapi.json`);
    expect(res.status).toBe(200);
    const doc = await res.json();
    expect(doc.openapi).toMatch(/^3\./);
    for (const p of ['/api/health', '/api/meta', '/api/info', '/api/jobs', '/api/files/{id}']) {
      expect(Object.keys(doc.paths), p).toContain(p);
    }
    expect(doc.info.title).toBeTruthy();
  });

  it('sets security + caching headers and hides the framework', async () => {
    const res = await fetch(`${base()}/api/health`);
    expect(res.headers.get('x-powered-by')).toBe(null);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('referrer-policy')).toBeTruthy();
    expect(res.headers.get('cache-control')).toMatch(/no-store/);
  });

  it('answers CORS preflight for API consumers', async () => {
    const res = await fetch(`${base()}/api/info`, {
      method: 'OPTIONS',
      headers: {
        origin: 'https://example.com',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    });
    expect([200, 204]).toContain(res.status);
    expect(res.headers.get('access-control-allow-origin')).toBeTruthy();
    expect(res.headers.get('access-control-allow-methods')).toMatch(/POST/);
  });

  it('never leaks stack traces on unexpected errors', async () => {
    const res = await fetch(`${base()}/api/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: DEMO_URL, preset: 'mp4-720', trim: { start: 'NaN', end: { $ne: null } } }),
    });
    const text = await res.text();
    expect(text).not.toMatch(/at Object\.|node_modules|\/src\//);
  });
});

describe('search-engine readiness (ranking)', () => {
  it('serves crawlable, keyword-rich content without JavaScript', async () => {
    const res = await fetch(`${ctx.baseUrl}/`);
    const html = await res.text();
    // A crawler that does not execute JS must still see a complete page.
    expect(html).toMatch(/<h1[^>]*>[^<]*YouTube/i);
    expect((html.match(/<h2/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect((html.match(/<h3/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(html.toLowerCase()).toContain('youtube video downloader');
    expect(html.toLowerCase()).toContain('mp3');
    expect(html).toMatch(/1080p/);
    expect(html).toMatch(/हिन्दी/);          // Hindi block for hreflang=hi searchers
    expect(html).toContain('<table');
    expect(html).toMatch(/<a href="\/faq"/);
    expect(html).toMatch(/<a href="\/api-docs"/);
    expect(html).toContain('Creative Commons'); // honest usage guidance
    expect(html.length).toBeGreaterThan(8000); // thin pages do not rank
  }, 60_000);

  it('keeps the structured data in sync with the visible FAQ', async () => {
    const html = await (await fetch(`${ctx.baseUrl}/`)).text();
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
    const faq = blocks.find((b) => b['@type'] === 'FAQPage');
    expect(faq).toBeTruthy();
    expect(faq.mainEntity.length).toBeGreaterThanOrEqual(5);
    for (const item of faq.mainEntity) {
      const question = item.name.replace(/&/g, '&amp;').replace(/’/g, '’');
      expect(html, `FAQ question not visible on the page: ${item.name}`).toContain(question);
    }
    const app = blocks.find((b) => b['@type'] === 'WebApplication');
    expect(app.offers.price).toBe('0');
    expect(app.applicationCategory).toBeTruthy();
  }, 60_000);

  it('injects Search Console / Bing verification meta tags when configured', async () => {
    const verified = await startTestServer({
      googleSiteVerification: 'abcDEF1234567890abc',
      bingSiteVerification: 'BINGTOKEN1234567890',
    });
    try {
      const html = await (await fetch(`${verified.baseUrl}/`)).text();
      expect(html).toContain('<meta name="google-site-verification" content="abcDEF1234567890abc" />');
      expect(html).toContain('<meta name="msvalidate.01" content="BINGTOKEN1234567890" />');
      expect(html.indexOf('google-site-verification')).toBeLessThan(html.indexOf('</head>'));
    } finally {
      await verified.close();
    }
    // Not configured → no empty tags.
    const plain = await (await fetch(`${ctx.baseUrl}/`)).text();
    expect(plain).not.toContain('google-site-verification');
    expect(plain).not.toContain('msvalidate.01');
  }, 120_000);

  it('never injects a hostile verification token', async () => {
    const bad = await startTestServer({ googleSiteVerification: '"><script>alert(1)</script>' });
    try {
      const html = await (await fetch(`${bad.baseUrl}/`)).text();
      expect(html).not.toContain('<script>alert(1)</script>');
      expect(html).not.toContain('google-site-verification');
    } finally {
      await bad.close();
    }
  }, 120_000);

  it('exposes a rich WebApplication schema with the real origin', async () => {
    const { body: html } = await rawGet(ctx.baseUrl, '/', { host: 'dl.ytvd.test' });
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
    const app = blocks.find((b) => b['@type'] === 'WebApplication');
    expect(app.url).toContain('dl.ytvd.test');
    expect(app.featureList.length).toBeGreaterThanOrEqual(5);
    expect(app.operatingSystem).toBeTruthy();
    expect(JSON.stringify(blocks)).not.toMatch(/aggregateRating/); // no fake review markup
  }, 60_000);
});

describe('published URLs follow the deployment origin (SEO)', () => {
  it('rewrites canonical/hreflang/og/JSON-LD from the request host', async () => {
    const { status, body } = await rawGet(ctx.baseUrl, '/', { host: 'ytvd.test' });
    expect(status).toBe(200);
    expect(body).not.toContain('example.com');
    expect(body).toContain('<link rel="canonical" href="http://ytvd.test/"');
    expect(body).toContain('hreflang="hi" href="http://ytvd.test/?lang=hi"');
    expect(body).toContain('"url": "http://ytvd.test/"');
    expect(body).toContain('id="root"');
    expect(body).toContain('id="seo-shell"');
    expect(body).toContain('og:url" content="http://ytvd.test/"');
  }, 60_000);

  it('rewrites robots.txt and sitemap.xml too', async () => {
    const robots = await rawGet(ctx.baseUrl, '/robots.txt', { host: 'ytvd.test' });
    expect(robots.body).toContain('Sitemap: http://ytvd.test/sitemap.xml');
    expect(robots.body).not.toContain('example.com');
    const sitemap = await rawGet(ctx.baseUrl, '/sitemap.xml', { host: 'ytvd.test' });
    const locs = [...sitemap.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs.length).toBeGreaterThan(3);
    expect(locs.every((loc) => loc.startsWith('http://ytvd.test'))).toBe(true);
  }, 60_000);

  it('honours an explicit SITE_URL and infers https behind a proxy', async () => {
    const pinned = await startTestServer({ siteUrl: 'https://dl.example.org' });
    try {
      const shell = await rawGet(pinned.baseUrl, '/', { host: 'ignored.test' });
      expect(shell.body).toContain('https://dl.example.org/');
      expect(shell.body).not.toContain('ignored.test');
    } finally {
      await pinned.close();
    }

    const proxied = await rawGet(ctx.baseUrl, '/', {
      host: 'ytvd.test',
      headers: { 'x-forwarded-proto': 'https' },
    });
    expect(proxied.body).toContain('https://ytvd.test/');
  }, 120_000);

  it('refuses to inject a hostile Host header into the HTML', async () => {
    const { body } = await rawGet(ctx.baseUrl, '/', { host: 'evil.test"><script>alert(1)</script>' });
    expect(body).not.toContain('<script>alert(1)</script>');
    expect(body).not.toContain('evil.test');
    expect(body).toMatch(/canonical" href="http:\/\/localhost:\d+\/"/);
  }, 60_000);
});

describe('security', () => {
  it('blocks path traversal on every file route', async () => {
    for (const p of [
      '/api/files/..%2f..%2f..%2fetc%2fpasswd',
      '/api/files/%2e%2e%2f%2e%2e%2fpackage.json',
      '/api/download/../../package.json',
    ]) {
      const res = await fetch(`${base()}${p}`);
      expect([400, 403, 404]).toContain(res.status);
      const text = await res.text();
      expect(text).not.toContain('"name": "ytvideodownloader"');
    }
  });

  it('does not accept shell metacharacters in ids/presets', async () => {
    const { status, json } = await api(base(), '/api/jobs', {
      method: 'POST', body: { url: DEMO_URL, preset: 'mp4-720; rm -rf /' },
    });
    expect(status).toBe(400);
    expect(json.error.code).toBe('INVALID_PRESET');
  });

  it('rejects unknown fields silently but never executes them', async () => {
    const { status, json } = await api(base(), '/api/jobs', {
      method: 'POST',
      body: { url: DEMO_URL, preset: 'mp4-720', __proto__: { polluted: true }, exec: 'rm -rf /' },
    });
    expect(status).toBe(201);
    expect(json.job).not.toHaveProperty('exec');
    expect({}.polluted).toBeUndefined();
  });
});
