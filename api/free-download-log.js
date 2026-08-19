import { assertUser } from './_lib/auth.js';
import { logWatermarkedFreeDownload } from './_lib/free-download-log.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const auth = await assertUser(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  const body = req.body || {};
  const r2Key = typeof body.r2_key === 'string' ? body.r2_key.trim() : '';
  if (!r2Key) return res.status(400).json({ error: 'Missing r2_key' });

  try {
    const result = await logWatermarkedFreeDownload({
      userId: auth.userId,
      email: auth.email,
      r2Key,
      wallpaperName: body.wallpaper_name,
    });
    if (!result.ok && result.error === 'need_invite') {
      return res.status(403).json({ error: 'need_invite' });
    }
    if (!result.ok && result.error === 'exhausted') {
      return res.status(403).json({ error: 'exhausted' });
    }
    if (!result.ok && result.error === 'no_user') {
      return res.status(401).json({ error: 'Login required' });
    }
    if (!result.ok) {
      return res.status(500).json({ error: result.error || 'insert failed' });
    }
    return res.status(200).json({ ok: true, source: result.source || null, duplicate: !!result.duplicate });
  } catch (err) {
    console.error('free-download-log api', err);
    return res.status(500).json({ error: 'Failed to log free download' });
  }
}
