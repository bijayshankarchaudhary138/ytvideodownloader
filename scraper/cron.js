/**
 * Cron scheduler - runs the scraper every minute
 * This ensures new notifications are posted within 1 minute of appearing on official sites
 */
import cron from 'node-cron';
import { runAllScrapers, initSources } from './index.js';

console.log(`[CRON] Sarkari Result Scraper started at ${new Date().toLocaleString('en-IN', {timeZone: 'Asia/Kolkata'})}`);
console.log('[CRON] Scraper will run every 1 minute. Press Ctrl+C to stop.\n');

initSources();

// Run once immediately on start
runAllScrapers().catch(console.error);

// Schedule every minute for fastest notifications
cron.schedule('* * * * *', () => {
  runAllScrapers().catch(console.error);
});

// Keep alive
process.on('SIGINT', () => {
  console.log('\n[CRON] Stopping scraper...');
  process.exit(0);
});
