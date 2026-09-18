/**
 * Turns a page from the catalogue (seo/pages.js) into crawlable HTML:
 *   • replaces <title>, description, canonical, hreflang, OG/Twitter tags
 *   • replaces the #seo-shell block with the page's own content
 *   • appends page-specific JSON-LD (FAQPage, HowTo, BreadcrumbList)
 *
 * The SPA replaces this shell on mount for human visitors, and search engines
 * that do not execute JavaScript read exactly this markup.
 */
import { SEO_PAGES, seoPage, normaliseSlug, relatedPages } from './pages.js';

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const HOME_TITLE = 'YouTube Video Downloader — 4K, MP3 & Playlists (No Ads)';
const HOME_DESCRIPTION =
  'Free YouTube video downloader: real 4K with audio merged, MP3 320 kbps, playlists as ZIP, subtitles, thumbnails and live progress. No ads, no popups, no sign-up.';

const HOME_H1 = 'YouTube Video Downloader — download in 4K, MP3 and playlists';

/** The marketing shell for a page (home falls back to the static content). */
export function shellHtml(page, { siteUrl }) {
  if (!page) return null; // home keeps the hand-written shell from index.html
  const links = relatedPages(page);
  const sections = page.sections
    .map((section) => {
      const parts = [`      <h2>${escapeHtml(section.h2 ?? '')}</h2>`];
      for (const paragraph of section.paras ?? []) parts.push(`      <p>${escapeHtml(paragraph)}</p>`);
      if (section.bullets?.length) {
        parts.push('      <ul>');
        for (const bullet of section.bullets) parts.push(`        <li>${escapeHtml(bullet)}</li>`);
        parts.push('      </ul>');
      }
      if (section.table) {
        parts.push('      <table>');
        parts.push('        <thead><tr>');
        for (const cell of section.table.head) parts.push(`          <th scope="col">${escapeHtml(cell)}</th>`);
        parts.push('        </tr></thead>');
        parts.push('        <tbody>');
        for (const row of section.table.rows) {
          parts.push('          <tr>');
          row.forEach((cell, index) => {
            parts.push(index === 0 ? `            <th scope="row">${escapeHtml(cell)}</th>` : `            <td>${escapeHtml(cell)}</td>`);
          });
          parts.push('          </tr>');
        }
        parts.push('        </tbody>');
        parts.push('      </table>');
      }
      return parts.join('\n');
    })
    .join('\n');

  const faqs = page.faqs
    .map((faq) => `      <h3>${escapeHtml(faq.q)}</h3>\n      <p>${escapeHtml(faq.a)}</p>`)
    .join('\n');

  const related = links.length
    ? `    <nav aria-label="Related pages">\n      <h2>Related</h2>\n      <ul>\n${links
        .map((entry) => `        <li><a href="${entry.slug}">${escapeHtml(entry.h1)}</a></li>`)
        .join('\n')}\n      </ul>\n    </nav>\n`
    : '';

  return `<div id="seo-shell" lang="${page.lang}">
  <header>
    <nav aria-label="Main">
      <a href="/">Home</a>
      <a href="/youtube-video-downloader">Downloader</a>
      <a href="/youtube-mp3-downloader">MP3</a>
      <a href="/youtube-playlist-downloader">Playlists</a>
      <a href="/faq">FAQ</a>
      <a href="/api-docs">API</a>
    </nav>
  </header>
  <main>
    <h1>${escapeHtml(page.h1)}</h1>
    <p>${escapeHtml(page.intro)}</p>

${sections}

    <h2>Frequently asked questions</h2>
${faqs}

${related}    <p>
      <a href="/">Open the downloader</a> · <a href="/how-to">How it works</a> ·
      <a href="/faq">All FAQs</a> · <a href="/api-docs">Free API</a> ·
      <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a>
    </p>
  </main>
  <footer>
    <p>Not affiliated with YouTube or Google. Download only content you are allowed to download.</p>
  </footer>
</div>`;
}

/** Structured data for a page (plus the site-wide WebApplication entity). */
export function jsonLdFor(page, { siteUrl }) {
  const url = `${siteUrl}${page ? page.slug : '/'}`;
  const blocks = [];

  blocks.push({
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: page?.h1 ?? 'YouTube Video Downloader',
    url,
    applicationCategory: 'MultimediaApplication',
    operatingSystem: 'Any (web browser, Android, iOS, Windows, macOS, Linux)',
    browserRequirements: 'Requires JavaScript for the interactive downloader; all content is available without it.',
    description: page?.description ?? HOME_DESCRIPTION,
    inLanguage: page?.lang ?? 'en',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    featureList: page
      ? [page.h1, ...page.sections.map((s) => s.h2).filter(Boolean)].slice(0, 8)
      : [
        '4K/8K downloads with merged audio',
        'MP3 320 kbps audio extraction',
        'Playlist downloads as a single ZIP',
        'Subtitles (.srt/.vtt) and thumbnails',
        'Live progress with speed and ETA',
        'Free documented REST + SSE API',
      ],
  });

  if (page) {
    blocks.push({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${siteUrl}/` },
        { '@type': 'ListItem', position: 2, name: page.h1, item: url },
      ],
    });
    blocks.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: page.faqs.map((faq) => ({
        '@type': 'Question',
        name: faq.q,
        acceptedAnswer: { '@type': 'Answer', text: faq.a },
      })),
    });
    blocks.push({
      '@context': 'https://schema.org',
      '@type': 'HowTo',
      name: `How to use: ${page.h1}`,
      totalTime: 'PT1M',
      estimatedCost: { '@type': 'MonetaryAmount', currency: 'USD', value: '0' },
      step: [
        { '@type': 'HowToStep', name: 'Copy the link', text: 'Copy the video, Shorts or playlist link from YouTube (Share → Copy link).' },
        { '@type': 'HowToStep', name: 'Paste and analyse', text: 'Paste the link into the box and press Analyse to load every available format.' },
        { '@type': 'HowToStep', name: 'Pick a format', text: 'Choose the quality or format you need — MP4, MP3, subtitles, thumbnail or a trim range.' },
        { '@type': 'HowToStep', name: 'Download', text: 'Press Download, follow the live progress and save the finished file.' },
      ],
    });
  }

  return blocks;
}

/**
 * Rewrites a served index.html for a specific route.
 * `page` may be null (home) — only the origin and verification tags change then.
 */
export function rewriteHtml(html, { page, siteUrl, verificationTags = '' }) {
  const canonical = `${siteUrl}${page ? page.slug : '/'}`;
  const title = page?.title ?? HOME_TITLE;
  const description = page?.description ?? HOME_DESCRIPTION;
  const language = page?.lang ?? 'en';
  const alternate = (hreflang, href) => `<link rel="alternate" hreflang="${hreflang}" href="${href}" />`;

  let out = html
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(title)}</title>`)
    .replace(/<meta name="description" content="[^"]*"\s*\/?>/, `<meta name="description" content="${escapeHtml(description)}" />`)
    .replace(/<link rel="canonical" href="[^"]*"\s*\/?>/, `<link rel="canonical" href="${canonical}" />`)
    .replace(
      /(?:<link rel="alternate" hreflang="[^"]*" href="[^"]*"\s*\/?>\s*)+/,
      [
        alternate('en', page?.lang === 'hi' ? `${siteUrl}${page.slug}` : canonical),
        alternate('hi', `${siteUrl}/?lang=hi`),
        alternate('x-default', canonical),
      ].join('\n'),
    )
    .replace(/<html lang="[^"]*"/, `<html lang="${language}"`)
    .replace(/<meta property="og:title" content="[^"]*"\s*\/?>/, `<meta property="og:title" content="${escapeHtml(title)}" />`)
    .replace(/<meta property="og:description" content="[^"]*"\s*\/?>/, `<meta property="og:description" content="${escapeHtml(description)}" />`)
    .replace(/<meta property="og:url" content="[^"]*"\s*\/?>/, `<meta property="og:url" content="${canonical}" />`)
    .replace(/<meta name="twitter:title" content="[^"]*"\s*\/?>/, `<meta name="twitter:title" content="${escapeHtml(title)}" />`)
    .replace(/<meta name="twitter:description" content="[^"]*"\s*\/?>/, `<meta name="twitter:description" content="${escapeHtml(description)}" />`)
    .replace(/<meta property="og:type" content="website"\s*\/?>/, `<meta property="og:type" content="website" />\n<meta property="og:locale" content="${language}" />`);

  // Replace the crawlable shell with this page's own markup.
  const shell = shellHtml(page, { siteUrl });
  if (shell) {
    out = out.replace(/<div id="seo-shell"[\s\S]*?<\/div>\s*(?=<noscript>)/, `${shell}\n\n`);
  }

  const scripts = jsonLdFor(page, { siteUrl })
    .map((block) => `    <script type="application/ld+json">${JSON.stringify(block)}</script>`)
    .join('\n');

  // Keep the hand-written JSON-LD on the home page, add ours on landing pages.
  if (page) {
    out = out.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>\s*/g, '');
  }
  out = out.replace('</head>', `${scripts}\n    ${verificationTags ? `${verificationTags}\n    ` : ''}</head>`);

  // Anything still carrying the build-time placeholder (og:image, twitter:image,
  // JSON-LD, preconnects) belongs to this deployment — never leak the placeholder.
  out = out.split('https://example.com').join(siteUrl);
  return out;
}

/** sitemap.xml with every crawlable route, in the site's real origin. */
export function sitemapXml({ siteUrl }) {
  const today = new Date().toISOString().slice(0, 10);
  const entries = [
    { loc: '/', priority: '1.0', changefreq: 'weekly', alternates: [{ hreflang: 'en', href: '/' }, { hreflang: 'hi', href: '/?lang=hi' }, { hreflang: 'x-default', href: '/' }] },
    ...SEO_PAGES.map((page) => ({
      loc: page.slug,
      priority: page.slug === '/youtube-video-downloader' ? '0.9' : '0.8',
      changefreq: 'monthly',
      alternates: [{ hreflang: page.lang === 'hi' ? 'hi' : 'en', href: page.slug }],
    })),
    { loc: '/how-to', priority: '0.7', changefreq: 'monthly', alternates: [] },
    { loc: '/faq', priority: '0.7', changefreq: 'monthly', alternates: [] },
    { loc: '/api-docs', priority: '0.6', changefreq: 'monthly', alternates: [] },
    { loc: '/privacy', priority: '0.3', changefreq: 'yearly', alternates: [] },
    { loc: '/terms', priority: '0.3', changefreq: 'yearly', alternates: [] },
  ];

  const urls = entries
    .map((entry) => {
      const alternates = entry.alternates
        .map((alt) => `    <xhtml:link rel="alternate" hreflang="${alt.hreflang}" href="${siteUrl}${alt.href}" />`)
        .join('\n');
      return [
        '  <url>',
        `    <loc>${siteUrl}${entry.loc}</loc>`,
        `    <lastmod>${today}</lastmod>`,
        `    <changefreq>${entry.changefreq}</changefreq>`,
        `    <priority>${entry.priority}</priority>`,
        alternates,
        '  </url>',
      ].filter(Boolean).join('\n');
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>
`;
}

/** robots.txt for the current origin. */
export function robotsTxt({ siteUrl }) {
  return `# Ad-free, open-source YouTube downloader. Crawl everything except the API.
User-agent: *
Allow: /
Disallow: /api/
Disallow: /api/files/
Disallow: /api/jobs/

Sitemap: ${siteUrl}/sitemap.xml
`;
}

export { SEO_PAGES, seoPage, normaliseSlug, escapeHtml };
