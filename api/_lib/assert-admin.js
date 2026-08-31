import { createClient } from '@supabase/supabase-js';

export const adminSb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false } }
);

export async function assertAdmin(req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return { ok: false, status: 401, error: 'Unauthorized' };
  const { data: { user }, error } = await adminSb.auth.getUser(token);
  if (error || !user) return { ok: false, status: 401, error: 'Unauthorized' };
  const { data: profile } = await adminSb.from('profiles').select('is_admin').eq('id', user.id).maybeSingle();
  if (profile?.is_admin) return { ok: true };
  if (user.email) {
    const { data: isAdmin } = await adminSb.rpc('is_admin_email', { check_email: user.email });
    if (isAdmin === true) return { ok: true };
  }
  return { ok: false, status: 403, error: 'Forbidden' };
}
