import db from '../../../lib/db';
import { verifyPassword, createToken, setAdminCookie } from '../../../lib/auth';

export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
  if (!admin || !verifyPassword(password, admin.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = createToken(admin.id, admin.username);
  setAdminCookie(res, token);
  res.json({ success: true, username: admin.username });
}
