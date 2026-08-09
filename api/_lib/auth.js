import { getServiceSupabase } from './supabase.js';

export async function assertUser(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return { ok: false, status: 401, error: 'Login required' };
  const sb = getServiceSupabase();
  const { data: { user }, error } = await sb.auth.getUser(token);
  if (error || !user?.email) return { ok: false, status: 401, error: 'Login required' };
  return {
    ok: true,
    userId: user.id,
    email: String(user.email).trim().toLowerCase(),
  };
}
