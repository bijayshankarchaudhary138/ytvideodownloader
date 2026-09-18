import { searchPosts } from '../../lib/posts';

export default function handler(req, res) {
  const q = req.query.q || '';
  if (q.length < 2) return res.json({ results: [] });
  const results = searchPosts(q, 30);
  res.json({ results });
}
