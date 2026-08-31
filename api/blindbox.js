import { assertUser } from './_lib/auth.js';
import { getServiceSupabase } from './_lib/supabase.js';
import {
  applyDraw,
  buildBlindboxState,
  getCurrentMonthGanZhi,
} from './_lib/blindbox.js';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await assertUser(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  const sb = getServiceSupabase();

  if (req.method === 'GET') {
    try {
      const state = await buildBlindboxState(sb, {
        userId: auth.userId,
        email: auth.email,
      });
      return res.status(200).json(state);
    } catch (err) {
      console.error('blindbox GET', err);
      return res.status(500).json({ error: 'Failed to load mystery box' });
    }
  }

  const action = String((req.body || {}).action || '').toLowerCase();
  if (action !== 'draw') {
    return res.status(400).json({ error: 'Unknown action' });
  }

  try {
    const month = getCurrentMonthGanZhi();
    if (!month) return res.status(500).json({ error: 'Month unavailable' });
    const stateBefore = await buildBlindboxState(sb, {
      userId: auth.userId,
      email: auth.email,
    });
    if (stateBefore.draw_count >= 3) {
      return res.status(400).json({ error: 'draw_limit' });
    }
    if (stateBefore.draw_count >= 1 && !stateBefore.annual_free) {
      return res.status(402).json({ error: 'Payment required' });
    }
    await applyDraw(sb, auth.userId, month);
    const state = await buildBlindboxState(sb, {
      userId: auth.userId,
      email: auth.email,
    });
    return res.status(200).json(state);
  } catch (err) {
    if (err.code === 'draw_limit') return res.status(400).json({ error: 'draw_limit' });
    if (err.code === 'pool_too_small') return res.status(503).json({ error: 'pool_too_small' });
    if (err.code === 'draw_conflict') return res.status(409).json({ error: 'draw_conflict' });
    console.error('blindbox draw', err);
    return res.status(500).json({ error: 'Draw failed' });
  }
}
