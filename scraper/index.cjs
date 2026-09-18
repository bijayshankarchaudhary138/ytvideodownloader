/**
 * Auto-Scraper System (CommonJS)
 * Monitors official government websites every minute
 * Auto-creates Sarkari Result format posts when new notifications found
 */

const axios = require('axios');
const cheerio = require('cheerio');
const { loadDB, saveDB, getNextId } = require('./lib/db.cjs');
const { autoGenerateFromNotification } = require('./lib/contentGenerator.cjs');

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
];

const SOURCES = [
  { name: 'SSC', url: 'https://ssc.gov.in/latest-news', selectors: ['a[href*=".pdf"]', '.news-item a', '.latest-news a'], officialWebsite: 'https://ssc.gov.in' },
  { name: 'UPSC', url: 'https://upsc.gov.in/whats-new', selectors: ['a[href*=".pdf"]', '.views-row a'], officialWebsite: 'https://upsc.gov.in' },
  { name: 'IBPS', url: 'https://www.ibps.in/crp-category-wise-notifications/', selectors: ['a[href*=".pdf"]', '.entry-content a'], officialWebsite: 'https://www.ibps.in' },
  { name: 'Railway RRB', url: 'https://rrcb.gov.in/', selectors: ['a[href*=".pdf"]', '.notification a', 'a[href*="notification"]'], officialWebsite: 'https://rrcb.gov.in' },
  { name: 'UPPSC', url: 'https://uppsc.up.nic.in/', selectors: ['a[href*=".pdf"]', 'a[href*="Notification"]'], officialWebsite: 'https://uppsc.up.nic.in' },
  { name: 'BPSC', url: 'https://www.bpsc.bih.nic.in/', selectors: ['a[href*=".pdf"]', 'a'], officialWebsite: 'https://www.bpsc.bih.nic.in' },
  { name: 'UPSSSC', url: 'https://upsssc.gov.in/News.aspx', selectors: ['a[href*=".pdf"]', 'a'], officialWebsite: 'https://upsssc.gov.in' },
  { name: 'RPSC', url: 'https://rpsc.rajasthan.gov.in/news', selectors: ['a[href*=".pdf"]', 'a'], officialWebsite: 'https://rpsc.rajasthan.gov.in' },
  { name: 'DSSSB', url: 'https://dsssb.delhi.gov.in/latest-updates', selectors: ['a[href*=".pdf"]', 'a'], officialWebsite: 'https://dsssb.delhi.gov.in' },
  { name: 'Indian Army', url: 'https://joinindianarmy.nic.in/', selectors: ['a[href*=".pdf"]', 'a'], officialWebsite: 'https://joinindianarmy.nic.in' },
  { name: 'Indian Navy', url: 'https://www.joinindiannavy.gov.in/', selectors: ['a[href*=".pdf"]', 'a'], officialWebsite: 'https://www.joinindiannavy.gov.in' },
  { name: 'SBI', url: 'https://sbi.co.in/web/careers', selectors: ['a[href*=".pdf"]', 'a'], officialWebsite: 'https://sbi.co.in' },
  { name: 'NTA', url: 'https://exams.nta.ac.in/', selectors: ['a[href*=".pdf"]', '.notice a', 'a'], officialWebsite: 'https://www.nta.ac.in' },
  { name: 'MPESB', url: 'https://esb.mp.gov.in/', selectors: ['a[href*=".pdf"]', 'a'], officialWebsite: 'https://esb.mp.gov.in' },
  { name: 'HPSC', url: 'https://hpsc.gov.in/', selectors: ['a[href*=".pdf"]', 'a'], officialWebsite: 'https://hpsc.gov.in' },
];

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 70) + '-' + Date.now().toString().slice(-4);
}

async function fetchWithRetry(url, retries = 1) {
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
        if (href.startsWith('/')) {
          try { href = new URL(href, source.url).href; } catch {}
        }
        if (!text) text = $el.parent().text().trim().replace(/\s+/g, ' ').substring(0, 200);
        if (!text || text.length < 8) return;
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
  const keywords = ['recruitment', 'notification', 'online form', 'apply online', 'vacancy', 'result', 'selected', 'merit list', 'cut off', 'admit card', 'call letter', 'hall ticket', 'exam date', 'answer key', 'syllabus', 'admission', 'scholarship', 'advt', 'advertisement', 'cwe', 'crp', '2025', '2026', '2027'];
  return keywords.some(k => t.includes(k)) || /\d{4}/.test(t);
}

async function scrapeSource(source, db) {
  const now = new Date().toLocaleString('en-IN', {timeZone: 'Asia/Kolkata'});
  console.log(`[SCRAPER] Checking ${source.name} at ${now}`);

  const html = await fetchWithRetry(source.url);
  if (!html) {
    logScrape(source, 'failed', 0, 0, 'Failed to fetch', db);
    return { found: 0, created: 0 };
  }

  const links = extractLinks(html, source);
  const relevant = links.filter(l => isRelevantNotification(l.title));

  let newFound = 0, newCreated = 0;

  for (const item of relevant) {
    if (db.posts.find(p => p.source_url === item.url)) continue;
    newFound++;

    const titleKey = item.title.toLowerCase().substring(0, 50);
    const isDup = db.posts.some(p => p.source_name === source.name && p.title.toLowerCase().includes(titleKey) &&
      (Date.now() - new Date(p.created_at).getTime()) < 7*86400000);
    if (isDup) continue;

    try {
      const postData = autoGenerateFromNotification(item.title, item.url);
      postData.organization = source.name;
      postData.source_url = item.url;
      postData.source_name = source.name;
      postData.official_website = source.officialWebsite;
      postData.status = 'published';
      postData.post_date = new Date().toISOString().slice(0, 10);
      postData.update_date = postData.post_date;
      postData.views = 0;
      postData.is_trending = 1;

      postData.slug = slugify(postData.title);

      const id = getNextId(db, 'posts');
      const post = { id, ...postData, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      db.posts.unshift(post);
      newCreated++;
      console.log(`[SCRAPER] ✅ CREATED: ${postData.title} (${postData.slug})`);
    } catch (e) {
      console.error(`[SCRAPER] Error creating post for "${item.title}":`, e.message);
    }
    await new Promise(r => setTimeout(r, 500));
  }

  const srcRow = db.sources.find(s => s.name === source.name);
  if (srcRow) { srcRow.last_checked = new Date().toISOString(); srcRow.last_found = relevant.length; }
  logScrape(source, newCreated > 0 ? 'success' : 'checked', newFound, newCreated, '', db);
  console.log(`[SCRAPER] ${source.name}: ${relevant.length} relevant, ${newFound} new URLs, ${newCreated} posts created`);
  return { found: newFound, created: newCreated };
}

function logScrape(source, status, found, created, message, db) {
  const sourceRow = db.sources.find(s => s.name === source.name);
  const sourceId = sourceRow ? sourceRow.id : null;
  db.scraping_logs.push({
    id: getNextId(db, 'scraping_logs'),
    source_id: sourceId, status, new_items_found: found, items_created: created, message,
    created_at: new Date().toISOString()
  });
}

async function runAllScrapers() {
  console.log(`\n[SCRAPER] ===== Starting scraping run at ${new Date().toLocaleString('en-IN', {timeZone: 'Asia/Kolkata'})} =====`);
  const db = loadDB();
  initSources(db);

  let totalCreated = 0;
  for (const source of SOURCES) {
    try {
      const result = await scrapeSource(source, db);
      totalCreated += result.created;
    } catch (e) {
      console.error(`[SCRAPER] Error scraping ${source.name}:`, e.message);
    }
    await new Promise(r => setTimeout(r, 3000));
  }

  saveDB(db);
  console.log(`[SCRAPER] ===== Run complete. Total new posts: ${totalCreated} =====\n`);
  return totalCreated;
}

function initSources(db) {
  SOURCES.forEach(s => {
    if (!db.sources.find(x => x.name === s.name)) {
      db.sources.push({ id: getNextId(db, 'sources'), name: s.name, url: s.url, enabled: 1, last_checked: null, last_found: 0 });
    }
  });
}

module.exports = { runAllScrapers, initSources, SOURCES };

if (require.main === module) {
  const cron = require('node-cron');
  initSources(loadDB());
  console.log(`[CRON] Sarkari Result Scraper started at ${new Date().toLocaleString('en-IN', {timeZone: 'Asia/Kolkata'})}`);
  console.log('[CRON] Will check all sources EVERY 1 MINUTE for new notifications.\n');
  runAllScrapers().catch(console.error);
  cron.schedule('* * * * *', () => { runAllScrapers().catch(console.error); });
  process.on('SIGINT', () => { console.log('\n[CRON] Stopping.'); process.exit(0); });
}
