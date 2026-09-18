import { clearAdminCookie } from '../../../lib/auth';

export default function handler(req, res) {
  clearAdminCookie(req, res);
  res.json({ success: true });
}
