// 删除壁纸：R2 原图 + 预览图 + Supabase 元数据
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { createClient } from '@supabase/supabase-js';

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

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
  if (error) return { ok: false, status: 500, error: 'Server error' };
  if (data !== true) return { ok: false, status: 403, error: 'Forbidden' };
  return { ok: true };
}

async function deleteR2Key(key) {
  if (!key) return;
  await s3.send(new DeleteObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
  }));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await assertAdmin(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  const { id } = req.body || {};
  if (!id) return res.status(400).json({ error: 'Missing id' });

  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRe.test(String(id))) return res.status(400).json({ error: 'Invalid id' });

  try {
    const { data: row, error: fetchErr } = await sb
      .from('wallpapers')
      .select('id, r2_key, preview_key')
      .eq('id', id)
      .single();
    if (fetchErr || !row) return res.status(404).json({ error: 'Not found' });

    // 先删 R2，再删库（R2 删失败不阻断库删除，避免脏数据残留为主）
    try { await deleteR2Key(row.r2_key); } catch (e) { console.error('R2 delete original', e); }
    try { await deleteR2Key(row.preview_key); } catch (e) { console.error('R2 delete preview', e); }

    const { error: delErr } = await sb.from('wallpapers').delete().eq('id', id);
    if (delErr) {
      console.error('wallpaper-delete DB error:', delErr);
      return res.status(500).json({ error: 'Database error' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('wallpaper-delete error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
