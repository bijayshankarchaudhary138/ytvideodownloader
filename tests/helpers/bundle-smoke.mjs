/**
 * Headless "browser" harness for the built bundle.
 *
 * Boots the REAL production bundle (web/dist) inside jsdom, points its relative
 * API calls at a live server, and drives the user flow:
 *   paste link → Analyse → pick a format → click Download → follow the ready link
 *
 * `--silent-sse` makes EventSource open but never deliver an event, which is what
 * happens when a proxy buffers/breaks the stream. The UI must still recover by
 * polling (that is the bug this harness was written to reproduce).
 *
 * Prints one JSON line to stdout; tests/web/bundle.test.js asserts on it.
 */
import { JSDOM } from 'jsdom';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs/promises';

function parseArgs(argv) {
  const out = { origin: 'http://127.0.0.1:8080', dist: 'web/dist', url: 'https://www.youtube.com/watch?v=demoBukkTub', silentSse: false, timeoutMs: 60_000 };
  for (let i = 0; i < argv.length; i += 1) {
    const [flag, value] = [argv[i], argv[i + 1]];
    if (flag === '--origin') { out.origin = value; i += 1; }
    else if (flag === '--dist') { out.dist = value; i += 1; }
    else if (flag === '--url') { out.url = value; i += 1; }
    else if (flag === '--timeout') { out.timeoutMs = Number(value); i += 1; }
    else if (flag === '--silent-sse') out.silentSse = true;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const result = { origin: args.origin, mounted: false, rows: 0, link: null, fileStatus: null, fileBytes: 0, consoleErrors: [], error: null };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const entryHtml = await fs.readFile(path.join(args.dist, 'index.html'), 'utf8');
  const dom = new JSDOM(entryHtml, { url: `${args.origin}/`, pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  const g = globalThis;

  for (const key of Object.getOwnPropertyNames(window)) {
    if (key in g) continue;
    try { g[key] = window[key]; } catch { /* read-only global */ }
  }
  g.window = window;
  g.document = window.document;
  try { Object.defineProperty(g, 'navigator', { value: window.navigator, configurable: true }); } catch { /* keep node's */ }

  if (typeof window.matchMedia !== 'function') {
    window.matchMedia = () => ({ matches: false, media: '', addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false });
    g.matchMedia = window.matchMedia;
  }

  const realFetch = g.fetch;
  const shim = (input, init) => {
    const url = typeof input === 'string' ? input : input?.url;
    return realFetch(typeof url === 'string' && url.startsWith('/') ? args.origin + url : input, init);
  };
  g.fetch = shim;
  window.fetch = shim;

  window.EventSource = args.silentSse
    ? class { constructor() { this.readyState = 1; } addEventListener() {} removeEventListener() {} close() {} }
    : undefined;
  if (arguments === undefined) throw new Error('unreachable');
  if (args.silentSse) g.EventSource = window.EventSource;

  const origError = console.error;
  console.error = (...a) => { result.consoleErrors.push(a.map(String).join(' ').slice(0, 200)); };

  const entry = entryHtml.match(/src="(\/assets\/index-[^"]+\.js)"/)?.[1];
  if (!entry) throw new Error('no entry chunk in dist/index.html');
  await import(/* @vite-ignore */ pathToFileURL(path.join(args.dist, entry)).href);

  const doc = window.document;
  const deadline = Date.now() + args.timeoutMs;
  const until = async (fn, stepMs = 120) => {
    while (Date.now() < deadline) {
      if (fn()) return true;
      await wait(stepMs);
    }
    return false;
  };

  result.mounted = await until(() => (doc.getElementById('root')?.children.length ?? 0) > 0);
  if (!result.mounted) {
    result.error = `app never mounted; body="${doc.body.textContent.replace(/\s+/g, ' ').slice(0, 200)}"`;
    return;
  }
  result.seoShellRemoved = !doc.getElementById('seo-shell');

  const input = doc.querySelector('input[type="url"], input');
  if (!input) throw new Error('no URL input rendered');
  const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setValue.call(input, args.url);
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
  await wait(100);

  const analyse = [...doc.querySelectorAll('button')].find((b) => /analyse|analyze|fetch|search/i.test(b.textContent));
  if (!analyse) throw new Error('no Analyse button');
  analyse.click();

  await until(() => doc.querySelectorAll('table tbody tr').length > 0);
  result.rows = doc.querySelectorAll('table tbody tr').length;
  result.alert = doc.querySelector('[role="alert"]')?.textContent?.slice(0, 160) ?? null;
  if (!result.rows) {
    result.error = `no formats rendered after analyse (alert: ${result.alert})`;
    return;
  }

  const download = doc.querySelector('table tbody tr button');
  if (!download) throw new Error('no download button in the first format row');
  download.click();

  await until(() => Boolean(doc.querySelector('a[href*="/api/files/"]')), 250);
  const link = doc.querySelector('a[href*="/api/files/"]');
  result.link = link?.getAttribute('href') ?? null;
  result.jobStatusText = doc.querySelector('[data-status]')?.getAttribute('data-status') ?? (doc.body.textContent.match(/queued|downloading|processing|ready|failed/i)?.[0] ?? null);

  if (result.link) {
    const res = await realFetch(args.origin + result.link);
    result.fileStatus = res.status;
    const buf = Buffer.from(await res.arrayBuffer());
    result.fileBytes = buf.length;
    result.fileType = res.headers.get('content-type');
  } else {
    result.error = 'download link never appeared (progress stream never updated the UI)';
  }
  console.error = origError;
  return;
}

try {
  await main();
} catch (err) {
  result.error = err?.stack ?? String(err);
}

process.stdout.write(`__BUNDLE_SMOKE__${JSON.stringify(result)}\n`);
process.exit(0);
