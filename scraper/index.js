/**
 * Auto-Scraper System
 * Monitors official government websites for new notifications
 * When new job/result/admitcard is found, automatically creates a blog post
 * in SarkariResult.com format within 1 minute
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import db from '../lib/db.js';
import { createPost } from '../lib/posts.js';
import { autoGenerateFromNotification, generatePostContent } from '../lib/contentGenerator.js';

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
];

// Major government job sources to monitor
const SOURCES = [
  {
    name: 'SSC',
    url: 'https://ssc.gov.in/latest-news',
    url2: 'https://ssc.nic.in/Portal/LatestNews',
    selectors: ['a[href*=".pdf"]', '.news-item a', '.latest-news a', '.notifications a'],
    officialWebsite: 'https://ssc.gov.in'
  },
  {
    name: 'UPSC',
    url: 'https://upsc.gov.in/recruitment/recruitment-advertisement',
    url2: 'https://upsc.gov.in/examinations/whats-new',
    selectors: ['a[href*=".pdf"]', '.views-row a', 'article a'],
    officialWebsite: 'https://upsc.gov.in'
  },
  {
    name: 'IBPS',
    url: 'https://www.ibps.in/crp-category-wise-notifications/',
    selectors: ['a[href*=".pdf"]', '.entry-content a', 'article a'],
    officialWebsite: 'https://www.ibps.in'
  },
  {
    name: 'Railway RRB',
    url: 'https://rrcb.gov.in/',
    selectors: ['a[href*=".pdf"]', '.notification a', 'a[href*="notification"]'],
    officialWebsite: 'https://rrcb.gov.in'
  },
  {
    name: 'UPPSC',
    url: 'https://uppsc.up.nic.in/Information/Notification',
    selectors: ['a[href*=".pdf"]', 'a[href*="Notification"]', 'a'],
    officialWebsite: 'https://uppsc.up.nic.in'
  },
  {
    name: 'BPSC',
    url: 'https://www.bpsc.bih.nic.in/',
    selectors: ['a[href*=".pdf"]', '#ContentPlaceHolder1_GridView1 a', '.table a', 'a'],
    officialWebsite: 'https://www.bpsc.bih.nic.in'
  },
  {
    name: 'UPSSSC',
    url: 'https://upsssc.gov.in/News.aspx',
    selectors: ['a[href*=".pdf"]', '#ContentPlaceHolder1_gvNews a', '.news a', 'a'],
    officialWebsite: 'https://upsssc.gov.in'
  },
  {
    name: 'MPSC',
    url: 'https://mpsc.gov.in/Advertisements',
    selectors: ['a[href*=".pdf"]', '.advertisement a', 'a'],
    officialWebsite: 'https://mpsc.gov.in'
  },
  {
    name: 'HPSC',
    url: 'https://hpsc.gov.in/en-us/Advertisements',
    selectors: ['a[href*=".pdf"]', 'a'],
    officialWebsite: 'https://hpsc.gov.in'
  },
  {
    name: 'RPSC',
    url: 'https://rpsc.rajasthan.gov.in/news',
    selectors: ['a[href*=".pdf"]', '.news a', 'a'],
    officialWebsite: 'https://rpsc.rajasthan.gov.in'
  },
  {
    name: 'DSSSB',
    url: 'https://dsssb.delhi.gov.in/latest-updates',
    selectors: ['a[href*=".pdf"]', '.views-field a', 'a'],
    officialWebsite: 'https://dsssb.delhi.gov.in'
  },
  {
    name: 'India Post GDS',
    url: 'https://www.indiapost.gov.in/recruitments',
    selectors: ['a[href*=".pdf"]', 'a[href*="gds"]', 'a'],
    officialWebsite: 'https://www.indiapost.gov.in'
  },
  {
    name: 'Indian Army',
    url: 'https://joinindianarmy.nic.in/latest-notifications.htm',
    selectors: ['a[href*=".pdf"]', 'a'],
    officialWebsite: 'https://joinindianarmy.nic.in'
  },
  {
    name: 'Indian Navy',
    url: 'https://www.joinindiannavy.gov.in/en/event/event-list.html',
    selectors: ['a[href*=".pdf"]', 'a'],
    officialWebsite: 'https://www.joinindiannavy.gov.in'
  },
  {
    name: 'Air Force',
    url: 'https://careerindianairforce.cdac.in/',
    selectors: ['a[href*=".pdf"]', 'a'],
    officialWebsite: 'https://careerindianairforce.cdac.in'
  },
  {
    name: 'Banking SBI',
    url: 'https://sbi.co.in/web/careers',
    selectors: ['a[href*=".pdf"]', '.career-notification a', 'a'],
    officialWebsite: 'https://sbi.co.in'
  },
  {
    name: 'CBSE',
    url: 'https://www.cbse.gov.in/cbsenew/cbse.html',
    selectors: ['a[href*=".pdf"]', '.latest_news a', 'a'],
    officialWebsite: 'https://www.cbse.gov.in'
  },
  {
    name: 'NTA',
    url: 'https://exams.nta.ac.in/',
    selectors: ['a[href*=".pdf"]', '.notice a', 'a'],
    officialWebsite: 'https://www.nta.ac.in'
  }
];

async function fetchWithRetry(url, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await axios.get(url, {
        timeout: 15000,
        headers: {
          'User-Agent': USER_AGENTS[i % USER_AGENTS.length],
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5,hi;q=0.3',
        },
        maxRedirects: 5,
        validateStatus: s => s < 500
      });
      return res.data;
    } catch (err) {
      if (i === retries) return null;
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

function extractLinks(html, source) {
  if (!html) return [];
  const $ = cheerio.load(html);
  const found = [];
  const seen = new Set();

  source.selectors.forEach(sel => {
    try {
      $(sel).each((i, el) => {
        const $el = $(el);
        let href = $el.attr('href') || '';
        let text = ($el.text() || '').trim().replace(/\s+/g, ' ');

        if (!href || href === '#' || href.startsWith('javascript')) return;
        if (href.startsWith('/')) href = new URL(href, source.url).href;
        if (!text) {
          // Try to find text in parent or nearby elements
          text = $el.parent().text().trim().replace(/\s+/g, ' ').substring(0, 200);
        }
        if (!text || text.length < 8) return;
        // Skip non-notification links
        if (/privacy|contact|sitemap|terms|copyright|login|register/i.test(text) && !/pdf|recruit|notification|result|admit|vacancy/i.test(text)) return;

        const key = href.split('?')[0];
        if (seen.has(key)) return;
        seen.add(key);

        found.push({ title: text.substring(0, 300), url: href });
      });
    } catch (e) {}
  });

  return found;
}

function isRelevantNotification(title) {
  const t = title.toLowerCase();
  const keywords = [
    'recruitment', 'notification', 'online form', 'apply online', 'vacancy',
    'result', 'selected', 'merit list', 'cut off', 'marks',
    'admit card', 'call letter', 'hall ticket', 'exam date', 'exam city',
    'answer key', 'objection',
    'syllabus', 'exam pattern',
    'admission', 'entrance',
    'scholarship',
    'advt', 'advertisement',
    'cwe', 'crp', 'direct recruitment',
    'july', 'august', 'september', 'october', 'november', 'december',
    'january', 'february', 'march', 'april', 'may', 'june',
    '2024', '2025', '2026', '2027'
  ];
  return keywords.some(k => t.includes(k)) || /\d{4}/.test(t);
}

export async function scrapeSource(source) {
  console.log(`[SCRAPER] Checking ${source.name} at ${new Date().toLocaleString('en-IN', {timeZone: 'Asia/Kolkata'})}`);
  const html = await fetchWithRetry(source.url);
  if (!html) {
    logScrape(source, 'failed', 0, 0, 'Failed to fetch page');
    return { found: 0, created: 0 };
  }

  const links = extractLinks(html, source);
  const relevant = links.filter(l => isRelevantNotification(l.title));

  // Also check alternate URL if exists
  if (source.url2) {
    const html2 = await fetchWithRetry(source.url2);
    if (html2) {
      const links2 = extractLinks(html2, source);
      links2.forEach(l => {
        if (isRelevantNotification(l.title) && !relevant.find(r => r.url === l.url)) {
          relevant.push(l);
        }
      });
    }
  }

  let newFound = 0;
  let newCreated = 0;

  for (const item of relevant) {
    // Check if we already have this URL
    const existing = db.prepare('SELECT id FROM posts WHERE source_url = ?').get(item.url);
    if (existing) continue;

    newFound++;
    // Check if title looks like duplicate
    const titleLower = item.title.toLowerCase().substring(0, 60);
    const recentDup = db.prepare(
      `SELECT id FROM posts WHERE source_name = ? AND lower(title) LIKE ? AND datetime(created_at) > datetime('now', '-7 days')`
    ).get(source.name, `%${titleLower}%`);
    if (recentDup) continue;

    // Generate post content
    try {
      const postData = autoGenerateFromNotification(item.title, item.url);
      postData.organization = source.name;
      postData.source_url = item.url;
      postData.source_name = source.name;
      postData.official_website = source.officialWebsite;

      const result = createPost(postData);
      newCreated++;
      console.log(`[SCRAPER] ✅ Created post: ${postData.title} (${result.slug})`);
    } catch (e) {
      console.error(`[SCRAPER] Error creating post for ${item.title}:`, e.message);
    }

    // Rate limit between posts
    await new Promise(r => setTimeout(r, 500));
  }

  db.prepare('UPDATE sources SET last_checked = ?, last_found = ? WHERE name = ?')
    .run(new Date().toISOString(), relevant.length, source.name);

  logScrape(source, newCreated > 0 ? 'success' : 'checked', newFound, newCreated);
  console.log(`[SCRAPER] ${source.name}: ${relevant.length} links, ${newFound} new, ${newCreated} posts created`);

  return { found: newFound, created: newCreated };
}

function logScrape(source, status, found, created, message = '') {
  const sourceRow = db.prepare('SELECT id FROM sources WHERE name = ?').get(source.name);
  if (sourceRow) {
    db.prepare('INSERT INTO scraping_logs (source_id, status, new_items_found, items_created, message) VALUES (?, ?, ?, ?, ?)')
      .run(sourceRow.id, status, found, created, message);
  }
}

export async function runAllScrapers() {
  console.log(`\n[SCRAPER] ===== Starting scraping run at ${new Date().toLocaleString('en-IN', {timeZone: 'Asia/Kolkata'})} =====`);
  let totalCreated = 0;

  for (const source of SOURCES) {
    try {
      const result = await scrapeSource(source);
      totalCreated += result.created;
    } catch (e) {
      console.error(`[SCRAPER] Error scraping ${source.name}:`, e.message);
    }
    // Polite delay between sources
    await new Promise(r => setTimeout(r, 3000));
  }

  console.log(`[SCRAPER] ===== Run complete. Total new posts: ${totalCreated} =====\n`);
  return totalCreated;
}

// Register sources in DB on startup
export function initSources() {
  const insert = db.prepare('INSERT OR IGNORE INTO sources (name, url, enabled) VALUES (?, ?, 1)');
  SOURCES.forEach(s => insert.run(s.name, s.url));
}

// Run standalone
if (import.meta.url === `file://${process.argv[1]}`) {
  initSources();
  runAllScrapers().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
  });
}
