import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getCookies, setCookie, deleteCookie } from 'cookies-next';
import db from './db';

const JWT_SECRET = process.env.JWT_SECRET || 'sarkari-result-secret-key-change-in-production';

export function verifyPassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

export function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

export function createToken(adminId, username) {
  return jwt.sign({ id: adminId, username }, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

export function getAdminFromRequest(req, res) {
  try {
    const cookies = getCookies({ req, res });
    const token = cookies.admin_token;
    if (!token) return null;
    const decoded = verifyToken(token);
    if (!decoded) return null;
    return db.prepare('SELECT id, username, name, email, role FROM admins WHERE id = ?').get(decoded.id);
  } catch {
    return null;
  }
}

export function setAdminCookie(res, token) {
  setCookie('admin_token', token, {
    req: res.req,
    res,
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60,
    path: '/',
    sameSite: 'lax'
  });
}

export function clearAdminCookie(req, res) {
  deleteCookie('admin_token', { req, res, path: '/' });
}

export function authMiddleware(handler) {
  return async (req, res) => {
    const admin = getAdminFromRequest(req, res);
    if (!admin) {
      if (req.url?.startsWith('/api/')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      res.writeHead(302, { Location: '/admin/login' });
      return res.end();
    }
    req.admin = admin;
    return handler(req, res);
  };
}
