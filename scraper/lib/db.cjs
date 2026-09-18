/**
 * Simple JSON-file database for scraper (CommonJS, no native deps)
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function loadDB() {
  if (fs.existsSync(DB_FILE)) {
    try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
    catch(e) { console.error('DB parse error:', e.message); }
  }
  return { posts: [], categories: [], sources: [], scraping_logs: [], subscribers: [], admins: [], _counters: { postId: 1, categoryId: 1, sourceId: 1, logId: 1, adminId: 1 } };
}

function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function getNextId(db, table) {
  let max = 0;
  db[table].forEach(r => { if (r.id > max) max = r.id; });
  return max + 1;
}

module.exports = { loadDB, saveDB, getNextId, DB_FILE, DATA_DIR };
