// 上传完成后保存壁纸元数据到 Supabase
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false } }
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const { data: { user }, error: authErr } = await sb.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Unauthorized' });

  const { data: profile } = await sb.from('profiles').select('is_admin').eq('id', user.id).single();
  if (!profile?.is_admin) return res.status(403).json({ error: 'Forbidden' });

  const { folder_number, element, tags, r2_key, filename } = req.body;
  if (!element || !r2_key || !filename) return res.status(400).json({ error: 'Missing params' });

  const { error: insertError } = await sb.from('wallpapers').insert({
    folder_number: parseInt(folder_number),
    element,
    tags: tags || [],
    r2_key,
    filename,
  });

  if (insertError) return res.status(500).json({ error: insertError.message });
  return res.status(200).json({ ok: true });
}
