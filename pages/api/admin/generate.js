import { withAdmin } from '../../../lib/withAdmin';
import { generatePostContent, autoGenerateFromNotification } from '../../../lib/contentGenerator';

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { title, ...data } = req.body;
  let generated;
  if (data.quickMode && title) {
    generated = autoGenerateFromNotification(title, data.sourceUrl);
  } else {
    generated = generatePostContent(data);
  }
  res.json(generated);
}

export default withAdmin(handler);
