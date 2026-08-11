// 注销当前登录账号（需 Bearer；确认文案由前端二次确认）
import { assertUser } from '../_lib/auth.js';
import { getServiceSupabase } from '../_lib/supabase.js';

const CONFIRM_PHRASES = new Set(['注销账号', '注销帐号', '註銷帳號', 'DELETE']);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const auth = await assertUser(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  const confirm = String(req.body?.confirm || '').trim();
  if (!CONFIRM_PHRASES.has(confirm)) {
    return res.status(400).json({ error: 'Confirm phrase mismatch' });
  }

  const sb = getServiceSupabase();
  const { error } = await sb.auth.admin.deleteUser(auth.userId);
  if (error) {
    console.error('account delete failed', error);
    return res.status(500).json({ error: 'Failed to delete account' });
  }

  return res.status(200).json({ ok: true });
}
