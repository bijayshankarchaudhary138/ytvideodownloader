import { getAllPosts, getRecentPosts } from '../../lib/posts';

export default function handler(req, res) {
  const { category, limit = 20 } = req.query;
  const data = getAllPosts({ category, limit: parseInt(limit) });
  res.json(data);
}
