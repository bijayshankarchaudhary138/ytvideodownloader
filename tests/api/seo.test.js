/**
 * SEO / ranking surface: every keyword landing page must be a real, unique,
 * crawlable page with matching structured data and working internal links.
 *
 * This is what stops the "we added pages for ranking" work from silently
 * breaking (duplicate titles, missing canonical, FAQ schema that does not match
 * the visible text, links to pages that 404, sitemap drift).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTestServer, api, rawGet } from '../helpers/server.js';
import { SEO_PAGES, crawlableSlugs, pageText } from '../../server/src/seo/pages.js';

let ctx;
beforeAll(async () => {
  ctx = await startTestServer();
}, 120_000);
afterAll(async () => {
  await ctx?.close();
});

const HOST = 'ytvd.test';
const fetchPage = (slug) => rawGet(ctx.baseUrl, slug, { host: HOST });

function ldBlocks(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => {
    try { return JSON.parse(m[1]); } catch { throw new Error('invalid JSON-LD block'); }
  });
}

describe('keyword landing pages', () => {
  it('covers every keyword cluster competitors rank with', () => {
    const slugs = SEO_PAGES.map((p) => p.slug);
    const expected = [
      '/youtube-video-downloader',
      '/youtube-mp3-downloader',
      '/youtube-playlist-downloader',
      '/youtube-shorts-downloader',
      '/youtube-4k-downloader',
      '/youtube-to-mp4',
      '/youtube-subtitle-downloader',
      '/youtube-thumbnail-downloader',
      '/youtube-video-trimmer',
      '/youtube-downloader-for-android',
      '/youtube-downloader-for-pc',
      '/free-youtube-downloader-no-ads',
      '/youtube-video-downloader-hindi',
    ];
    for (const slug of expected) expect(slugs, `missing landing page ${slug}`).toContain(slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('serves each page with unique title, description, h1 and canonical', async () => {
    const titles = new Set();
    const descriptions = new Set();

    for (const page of SEO_PAGES) {
      const { status, body } = await fetchPage(page.slug);
      expect(status, `${page.slug} → ${status}`).toBe(200);

      const title = body.match(/<title>([^<]+)<\/title>/)?.[1] ?? '';
      const description = body.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? '';
      const canonical = body.match(/<link rel="canonical" href="([^"]*)"/)?.[1] ?? '';
      const h1 = body.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? '';

      expect(title, `${page.slug} has no title`).toBeTruthy();
      expect(title.length).toBeLessThan(75);
      expect(description.length, `${page.slug} description too short`).toBeGreaterThan(70);
      expect(description.length).toBeLessThan(200);
      expect(canonical).toBe(`http://${HOST}${page.slug}`);
      expect(h1.toLowerCase()).toContain(page.h1.toLowerCase().split(' ')[0].toLowerCase());
      expect(html_decoded(h1).trim()).toBe(page.h1);

      // Unique per page — duplicate metas make Google pick for you.
      expect(titles.has(title), `duplicate title: ${title}`).toBe(false);
      expect(descriptions.has(description), `duplicate description on ${page.slug}`).toBe(false);
      titles.add(title);
      descriptions.add(description);
    }
  }, 120_000);

  it('keeps every visible line of content in the HTML (no JS required)', async () => {
    for (const page of SEO_PAGES) {
      const { body } = await fetchPage(page.slug);
      const text = html_decoded(body.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ');
      // H1, intro, section headings, bullets and FAQ answers must all be present.
      for (const chunk of pageText(page).split('\n').filter((line) => line.trim().length > 25).slice(0, 40)) {
        const probe = chunk.trim().slice(0, 40).replace(/\s+/g, ' ');
        expect(text, `${page.slug} is missing visible content: "${probe}…"`).toContain(probe);
      }
      expect(body.length, `${page.slug} is a thin page`).toBeGreaterThan(6000);
    }
  }, 180_000);

  it('ships matching FAQPage + BreadcrumbList + HowTo structured data', async () => {
    for (const page of SEO_PAGES) {
      const { body } = await fetchPage(page.slug);
      const blocks = ldBlocks(body);
      const faq = blocks.find((b) => b['@type'] === 'FAQPage');
      const crumbs = blocks.find((b) => b['@type'] === 'BreadcrumbList');
      const howTo = blocks.find((b) => b['@type'] === 'HowTo');
      const app = blocks.find((b) => b['@type'] === 'WebApplication');

      expect(faq, `${page.slug} has no FAQPage`).toBeTruthy();
      expect(faq.mainEntity.length).toBeGreaterThanOrEqual(4);
      expect(crumbs.itemListElement.at(-1).item).toBe(`http://${HOST}${page.slug}`);
      expect(crumbs.itemListElement[0].item).toBe(`http://${HOST}/`);
      expect(howTo.step.length).toBeGreaterThanOrEqual(3);
      expect(app.offers.price).toBe('0');
      expect(JSON.stringify(blocks)).not.toMatch(/aggregateRating|reviewCount/); // no fake markup
      for (const item of faq.mainEntity) {
        expect(body, `${page.slug} FAQ not visible: ${item.name}`).toContain(item.name.slice(0, 30).replace(/'/g, '&#39;'));
      }
    }
  }, 180_000);

  it('links between pages, and every internal link resolves', async () => {
    const seen = new Set();
    for (const page of SEO_PAGES) {
      const { body } = await fetchPage(page.slug);
      const hrefs = [...body.matchAll(/href="(\/[^"#?]*)"/g)].map((m) => m[1]);
      const internal = hrefs.filter((href) => !href.startsWith('/api/') && !href.startsWith('/assets/'));
      expect(internal.length, `${page.slug} has no internal links`).toBeGreaterThanOrEqual(5);
      for (const href of internal) seen.add(href);
    }
    for (const href of seen) {
      const { status } = await fetchPage(href);
      expect([200, 301, 302], `dead internal link: ${href} → ${status}`).toContain(status);
    }
  }, 180_000);

  it('lists every page in sitemap.xml exactly once, with the real origin', async () => {
    const { body } = await fetchPage('/sitemap.xml');
    const locs = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(new Set(locs).size).toBe(locs.length);
    for (const slug of crawlableSlugs()) {
      expect(locs, `sitemap is missing ${slug}`).toContain(`http://${HOST}${slug === '/' ? '/' : slug}`);
    }
    for (const loc of locs) expect(loc.startsWith(`http://${HOST}/`)).toBe(true);
    expect(body).not.toContain('example.com');
  }, 120_000);

  it('serves robots.txt from the same origin, with the sitemap pointer', async () => {
    const { body, status } = await fetchPage('/robots.txt');
    expect(status).toBe(200);
    expect(body).toContain('Sitemap: http://ytvd.test/sitemap.xml');
    expect(body).toContain('Allow: /');
    expect(body).toContain('Disallow: /api/');
  }, 60_000);

  it('has no hreflang duplicates and marks the Hindi page as Hindi', async () => {
    const hindi = await fetchPage('/youtube-video-downloader-hindi');
    expect(hindi.body).toContain('<html lang="hi"');
    expect(hindi.body).toMatch(/[\u0900-\u097F]/);
    const english = await fetchPage('/youtube-video-downloader');
    expect(english.body).toContain('<html lang="en"');
    for (const { body } of [hindi, english]) {
      const hreflangs = [...body.matchAll(/hreflang="([^"]+)"/g)].map((m) => m[1]);
      expect(new Set(hreflangs).size).toBe(hreflangs.length);
      expect(hreflangs).toEqual(expect.arrayContaining(['en', 'hi', 'x-default']));
    }
  }, 60_000);

  it('includes the landing pages in the app\'s own manifest and tests build output', async () => {
    // The static sitemap in web/public is what pure-static hosts serve.
    const staticSitemap = await import('node:fs/promises').then((fs) => fs.readFile('web/public/sitemap.xml', 'utf8'));
    for (const page of SEO_PAGES) expect(staticSitemap, `static sitemap missing ${page.slug}`).toContain(`/example.com${page.slug}<`);
  });

  it('never leaks a placeholder domain into a served page', async () => {
    for (const slug of ['/', ...SEO_PAGES.map((p) => p.slug)]) {
      const { body } = await fetchPage(slug);
      expect(body, `${slug} still contains example.com`).not.toContain('example.com');
    }
  }, 120_000);
});

/** Decode the entities we escape when rendering the shell. */
function html_decoded(value) {
  return String(value)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
}

describe('landing pages stay honest', () => {
  it('does not promise things the app cannot do', async () => {
    const banned = [/watermark removal is guaranteed/i, /unlimited downloads forever/i, /bypass (?:drm|age)/i, /no copyright/i];
    for (const page of SEO_PAGES) {
      const text = pageText(page);
      for (const pattern of banned) expect(pattern.test(text), `${page.slug} makes an unsafe claim`).toBe(false);
    }
  });

  it('warns about copyright on pages where it matters', () => {
    for (const slug of ['/youtube-video-downloader', '/youtube-shorts-downloader', '/youtube-video-downloader-hindi']) {
      const page = SEO_PAGES.find((p) => p.slug === slug);
      expect(pageText(page)).toMatch(/copyright|licens|permission|क़ानून|अनुमति/i);
    }
  });

  it('is reachable through the API health check too (same server)', async () => {
    const { status } = await api(ctx.baseUrl, '/api/health');
    expect(status).toBe(200);
  });
});
