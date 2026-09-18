import { withAdmin } from '../../../lib/withAdmin';

// Use CJS scraper dynamically since it's written in CommonJS
async function handler(req, res) {
  try {
    const { runAllScrapers, initSources } = require('../../../scraper/index.cjs');
    initSources();
    const created = await runAllScrapers();
    res.json({ success: true, postsCreated: created });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
}

export default withAdmin(handler);
export const config = { api: { bodyParser: true } };
