/**
 * Entry point for scraper cron
 * Run with: node scraper/cron.cjs
 */
const { runAllScrapers, initSources } = require('./index.cjs');

console.log(`═══════════════════════════════════════════════════`);
console.log(`  🔴 SARKARI RESULT AUTO-SCRAPER`);
console.log(`  Checks official sites EVERY 1 MINUTE`);
console.log(`  New posts auto-published in SarkariResult format`);
console.log(`═══════════════════════════════════════════════════\n`);

const db = require('./lib/db.cjs');
const dbData = db.loadDB();
initSources(dbData);
db.saveDB(dbData);

runAllScrapers().catch(console.error);

const cron = require('node-cron');
cron.schedule('* * * * *', () => { runAllScrapers().catch(console.error); });

process.on('SIGINT', () => {
  console.log('\n[CRON] Stopping scraper...');
  process.exit(0);
});
