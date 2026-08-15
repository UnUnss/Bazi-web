// 上传完成后保存壁纸元数据到 Supabase
// 鉴权：Bearer token，且 profiles.is_admin = true
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false } }
);

async function assertAdmin(req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return { ok: false, status: 401, error: 'Unauthorized' };
  const { data: { user }, error } = await sb.auth.getUser(token);
  if (error || !user) return { ok: false, status: 401, error: 'Unauthorized' };
  const { data: profile } = await sb.from('profiles').select('is_admin').eq('id', user.id).maybeSingle();
  if (profile?.is_admin) return { ok: true };
  if (user.email) {
    const { data: isAdmin } = await sb.rpc('is_admin_email', { check_email: user.email });
    if (isAdmin === true) return { ok: true };
  }
  return { ok: false, status: 403, error: 'Forbidden' };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const auth = await assertAdmin(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  const { folder_number, element, tags, r2_key, preview_key, filename, id, action } = req.body || {};

  if (action === 'set_preview') {
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!id || !uuidRe.test(String(id)) || !preview_key) {
      return res.status(400).json({ error: 'Missing params' });
    }
    const { error: updateError } = await sb
      .from('wallpapers')
      .update({ preview_key: String(preview_key) })
      .eq('id', id);
    if (updateError) {
      console.error('wallpaper-meta preview update', updateError);
      return res.status(500).json({ error: 'Database error' });
    }
    return res.status(200).json({ ok: true });
  }

  if (!element || !r2_key || !filename) return res.status(400).json({ error: 'Missing params' });

  const VALID_ELEMENTS = new Set(['金', '木', '水', '火', '土']);
  if (!VALID_ELEMENTS.has(element)) return res.status(400).json({ error: 'Invalid element' });

  const VALID_TAGS = new Set(['人缘运', '才华运', '财富运', '感情运', '事业运', '健康运', '贵人运']);
  const tagsArr = Array.isArray(tags) ? tags : [];
  if (tagsArr.some((t) => !VALID_TAGS.has(t))) return res.status(400).json({ error: 'Invalid tags' });

  const { error: insertError } = await sb.from('wallpapers').insert({
    folder_number: parseInt(folder_number, 10),
    element,
    tags: tagsArr,
    r2_key,
    preview_key: preview_key || null,
    filename,
  });

  if (insertError) {
    console.error('wallpaper-meta insert error:', insertError);
    return res.status(500).json({ error: 'Database error' });
  }
  return res.status(200).json({ ok: true });
}
