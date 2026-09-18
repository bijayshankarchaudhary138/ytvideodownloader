import { getAdminFromRequest } from './auth';

export function withAdmin(handler) {
  return async (req, res) => {
    const admin = getAdminFromRequest(req, res);
    if (!admin) return res.status(401).json({ error: 'Unauthorized' });
    req.admin = admin;
    return handler(req, res);
  };
}
