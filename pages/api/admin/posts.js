import { withAdmin } from '../../../lib/withAdmin';
import { createPost, updatePost, deletePost } from '../../../lib/posts';
import db from '../../../lib/db';
import { generatePostContent } from '../../../lib/contentGenerator';

async function handler(req, res) {
  if (req.method === 'GET') {
    const posts = db.prepare(`
      SELECT id, slug, title, category, post_date, status, is_trending, views, created_at
      FROM posts ORDER BY id DESC LIMIT 200
    `).all();
    return res.json({ posts });
  }

  if (req.method === 'POST') {
    const data = req.body;
    // Auto-generate full content in Sarkari Result format if minimal data provided
    if (data.autoGenerate) {
      const fullData = generatePostContent(data);
      const result = createPost(fullData);
      return res.json(result);
    }
    const result = createPost(data);
    return res.json(result);
  }

  if (req.method === 'PUT') {
    const { id, ...data } = req.body;
    updatePost(id, data);
    return res.json({ success: true });
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    deletePost(parseInt(id));
    return res.json({ success: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
}

export default withAdmin(handler);
