/**
 * Web build tests: SEO, PWA, i18n, performance budget and "no hardcoded
 * localhost" guarantees for the front-end bundle.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const ROOT = process.cwd();
// Build into a private directory: `npm test` must never overwrite the shipped
// bundle (and must never race another test doing its own build).
let DIST;

let html = '';
let assets = { js: [], css: [], other: [] };

async function walk(dir, acc = []) {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) await walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

beforeAll(async () => {
  DIST = await fs.mkdtemp(path.join(os.tmpdir(), 'ytvd-build-'));
  await execFileAsync(
    process.execPath,
    [path.join(ROOT, 'node_modules/vite/bin/vite.js'), 'build', '--config', 'web/vite.config.js', '--outDir', DIST, '--emptyOutDir'],
    {
      cwd: ROOT,
      maxBuffer: 20 * 1024 * 1024,
      env: { ...process.env, NODE_ENV: 'production' },
    },
  );
  html = await fs.readFile(path.join(DIST, 'index.html'), 'utf8');
  const files = await walk(DIST);
  assets = {
    js: files.filter((f) => f.endsWith('.js')),
    css: files.filter((f) => f.endsWith('.css')),
    other: files.filter((f) => !f.endsWith('.js') && !f.endsWith('.css')),
  };
}, 300_000);

afterAll(async () => {
  if (DIST) await fs.rm(DIST, { recursive: true, force: true });
});

describe('build output', () => {
  it('produces index.html + hashed assets', () => {
    expect(html.length).toBeGreaterThan(2000);
    expect(assets.js.length).toBeGreaterThan(0);
    expect(assets.css.length).toBeGreaterThan(0);
    const hashed = assets.js.some((f) => /-[A-Za-z0-9_]{8}\.js$/.test(path.basename(f)));
    expect(hashed, 'assets must be content-hashed for cache busting').toBe(true);
  });

  it('keeps the bundle inside the performance budget', async () => {
    let jsBytes = 0;
    let cssBytes = 0;
    for (const f of assets.js) jsBytes += (await fs.stat(f)).size;
    for (const f of assets.css) cssBytes += (await fs.stat(f)).size;
    expect(jsBytes, `JS bundle is ${(jsBytes / 1024).toFixed(0)}KB`).toBeLessThan(900 * 1024);
    expect(cssBytes).toBeLessThan(250 * 1024);
  });

  it('never ships a hardcoded localhost/127.0.0.1 API call', async () => {
    // Documentation snippets may mention localhost; network calls must not.
    const callPattern = /(fetch|EventSource|XMLHttpRequest|open)\(\s*[`'"]https?:\/\/(localhost|127\.0\.0\.1)/;
    for (const f of [...assets.js, ...assets.css]) {
      const text = await fs.readFile(f, 'utf8');
      expect(callPattern.test(text), `${path.basename(f)} calls localhost directly`).toBe(false);
      expect(text.includes('"127.0.0.1"') || text.includes("'127.0.0.1'"), `${path.basename(f)} hardcodes 127.0.0.1`).toBe(false);
    }
  });
});

describe('SEO', () => {
  it('has the core meta tags', () => {
    expect(html).toMatch(/<html lang="en"/);
    expect(html).toMatch(/<title>[^<]*YouTube[^<]*<\/title>/i);
    expect(html).toMatch(/<meta name="description" content="[^"]{80,300}"/);
    expect(html).toMatch(/<meta name="viewport" content="[^"]*width=device-width/);
    expect(html).toMatch(/<meta name="theme-color" content="#[0-9a-fA-F]{3,8}"/);
    expect(html).toMatch(/<link rel="canonical" href="https?:\/\/[^"]+"/);
  });

  it('has social sharing tags', () => {
    expect(html).toMatch(/property="og:title"/);
    expect(html).toMatch(/property="og:description"/);
    expect(html).toMatch(/property="og:image" content="https?:\/\/[^"]+"/);
    expect(html).toMatch(/property="og:type" content="website"/);
    expect(html).toMatch(/name="twitter:card" content="summary_large_image"/);
  });

  it('ships crawlable content for non-JS crawlers with real headings and FAQ', () => {
    const shell = html.replace(/<script[\s\S]*?<\/script>/g, '');
    expect(shell).toMatch(/<h1[^>]*>[^<]*(YouTube|Video)[^<]*<\/h1>/i);
    expect(shell.match(/<h2/g)?.length).toBeGreaterThanOrEqual(3);
    expect(shell).toMatch(/download/i);
    expect(shell).toContain('id="seo-shell"');
    // internal linking for crawlers
    for (const href of ['/how-to', '/faq', '/api-docs', '/privacy', '/terms']) {
      expect(shell, href).toContain(`href="${href}"`);
    }
  });

  it('has structured data: WebApplication, FAQPage, HowTo (and no fake ratings)', () => {
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
    const flat = blocks.flatMap((b) => (Array.isArray(b) ? b : [b]));
    const types = flat.map((b) => b['@type']);
    expect(types).toContain('WebApplication');
    expect(types).toContain('FAQPage');
    expect(types).toContain('HowTo');
    const app = flat.find((b) => b['@type'] === 'WebApplication');
    expect(app.offers.price).toBe('0');
    expect(app.operatingSystem).toBeTruthy();
    const faq = flat.find((b) => b['@type'] === 'FAQPage');
    expect(faq.mainEntity.length).toBeGreaterThanOrEqual(5);
    expect(html.toLowerCase()).not.toContain('aggregaterating');
  });

  it('declares hreflang alternates for en + hi', () => {
    expect(html).toMatch(/hreflang="en"/);
    expect(html).toMatch(/hreflang="hi"/);
    expect(html).toMatch(/hreflang="x-default"/);
  });

  it('preconnects and preloads for fast LCP', () => {
    // Vite emits modulepreload for the JS chunks + a stylesheet link.
    expect(html).toMatch(/rel="(module)?preload"/);
    expect(html).toMatch(/rel="stylesheet"/);
    expect(html).toMatch(/<link rel="icon"/);
    expect(html).toMatch(/rel="apple-touch-icon"/);
  });
});

describe('PWA', () => {
  it('links a valid manifest with maskable icons', async () => {
    expect(html).toContain('rel="manifest"');
    const manifest = JSON.parse(await fs.readFile(path.join(DIST, 'manifest.webmanifest'), 'utf8'));
    expect(manifest.name).toMatch(/Downloader/i);
    expect(manifest.short_name.length).toBeLessThanOrEqual(12);
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('/');
    const sizes = manifest.icons.map((i) => i.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
    expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true);
    expect(manifest.categories).toContain('utilities');
  });

  it('ships a service worker that caches the shell and never the API', async () => {
    const sw = await fs.readFile(path.join(DIST, 'sw.js'), 'utf8');
    expect(sw).toContain('caches.open');
    expect(sw).toMatch(/addEventListener\('install'/);
    expect(sw).toMatch(/addEventListener\('fetch'/);
    expect(sw).toMatch(/\/api\//);
    expect(sw).toMatch(/CACHE_VERSION|VERSION/);
  });

  it('copies robots.txt, sitemap.xml and icons into dist', async () => {
    const names = assets.other.map((f) => path.basename(f));
    expect(names).toContain('robots.txt');
    expect(names).toContain('sitemap.xml');
    expect(names.some((n) => n.endsWith('.svg') || n.endsWith('.png'))).toBe(true);
  });
});

describe('styles', () => {
  it('ships dark-mode support and reduced-motion handling', async () => {
    const css = (await Promise.all(assets.css.map((f) => fs.readFile(f, 'utf8')))).join('\n');
    expect(css).toMatch(/\[data-theme=["']?dark["']?\]/);
    expect(css).toContain('prefers-reduced-motion');
    expect(css).toContain('prefers-color-scheme');
    expect(css).toContain(':focus-visible');
  });
});
