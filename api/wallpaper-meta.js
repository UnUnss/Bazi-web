// 上传完成后保存壁纸元数据到 Supabase
// 鉴权同 presign：Bearer token 或 X-Admin-Email
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false } }
);

async function assertAdmin(req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (token) {
    const { data: { user }, error } = await sb.auth.getUser(token);
    if (error || !user) return { ok: false, status: 401, error: 'Unauthorized' };
    const { data: profile } = await sb.from('profiles').select('is_admin').eq('id', user.id).single();
    if (!profile?.is_admin) return { ok: false, status: 403, error: 'Forbidden' };
    return { ok: true };
  }

  const email = (req.headers['x-admin-email'] || '').trim();
  if (!email) return { ok: false, status: 401, error: 'Missing auth' };

  const { data, error } = await sb.rpc('is_admin_email', { check_email: email });
  if (error) return { ok: false, status: 500, error: error.message };
  if (data !== true) return { ok: false, status: 403, error: 'Forbidden' };
  return { ok: true };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const auth = await assertAdmin(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  const { folder_number, element, tags, r2_key, preview_key, filename } = req.body;
  if (!element || !r2_key || !filename) return res.status(400).json({ error: 'Missing params' });

  const { error: insertError } = await sb.from('wallpapers').insert({
    folder_number: parseInt(folder_number),
    element,
    tags: tags || [],
    r2_key,
    preview_key: preview_key || null,
    filename,
  });

  if (insertError) return res.status(500).json({ error: insertError.message });
  return res.status(200).json({ ok: true });
}
