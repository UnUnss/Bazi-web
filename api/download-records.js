// 下载记录云端同步：GET 拉取 / POST 写入
import { assertUser } from './_lib/auth.js';
import { getServiceSupabase } from './_lib/supabase.js';

export default async function handler(req, res) {
  const auth = await assertUser(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
  const { userId, email } = auth;
  const sb = getServiceSupabase();

  try {
    if (req.method === 'GET') {
      const limit = Math.min(Number(req.query?.limit) || 200, 500);
      const [byEmail, byUser] = await Promise.all([
        sb.from('download_records')
          .select('id, r2_key, preview_url, wallpaper_name, created_at')
          .eq('owner_email', email)
          .order('created_at', { ascending: false })
          .limit(limit),
        sb.from('download_records')
          .select('id, r2_key, preview_url, wallpaper_name, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(limit),
      ]);
      const map = new Map();
      [...(byEmail.data || []), ...(byUser.data || [])].forEach((r) => {
        if (r?.id) map.set(r.id, r);
      });
      const records = [...map.values()]
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
        .slice(0, limit)
        .map((r) => ({
          r2key: r.r2_key,
          img: r.preview_url || '',
          name: r.wallpaper_name || '',
          date: String(r.created_at || '').slice(0, 19).replace('T', ' '),
        }));
      return res.status(200).json({ records });
    }

    if (req.method === 'POST') {
      const { r2key, img, name, monthGanZhi } = req.body || {};
      if (!r2key) return res.status(400).json({ error: 'Missing r2key' });
      const { error } = await sb.from('download_records').insert({
        user_id: userId,
        owner_email: email,
        r2_key: r2key,
        preview_url: img || null,
        wallpaper_name: name || null,
      });
      if (error) {
        console.error('download-records POST error', error);
        return res.status(500).json({ error: 'Database error' });
      }
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('download-records error', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
