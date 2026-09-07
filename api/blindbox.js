import { assertUser } from './_lib/auth.js';
import { getServiceSupabase } from './_lib/supabase.js';
import {
  applyDraw,
  buildBlindboxState,
  getOrCreateMonth,
  hasActiveAnnual,
  publicCard,
  resolveDisplayedMonthGanZhi,
  unusedCreditCount,
} from './_lib/blindbox.js';

function r2PublicUrl() {
  return (process.env.R2_PUBLIC_URL || 'https://pub-9caba4113e9842559ae43c91003a0b05.r2.dev').replace(/\/$/, '');
}

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
        monthGanZhi: req.query?.month_ganzhi || req.query?.monthGanZhi || '',
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
    const month = resolveDisplayedMonthGanZhi((req.body || {}).month_ganzhi);
    if (!month) return res.status(500).json({ error: 'Month unavailable' });
    const [annualFree, row] = await Promise.all([
      hasActiveAnnual(sb, { userId: auth.userId, email: auth.email }),
      getOrCreateMonth(sb, auth.userId, month),
    ]);
    if (row.draw_count >= 3) {
      return res.status(400).json({ error: 'draw_limit' });
    }
    if (row.draw_count >= 1 && !annualFree) {
      return res.status(402).json({ error: 'Payment required' });
    }
    const drawn = await applyDraw(sb, auth.userId, month);
    return res.status(200).json({
      month_ganzhi: month,
      draw_count: drawn.row.draw_count || 0,
      cards: (drawn.cards || []).map((c) => publicCard(c, r2PublicUrl())).filter(Boolean),
      unused_credits: unusedCreditCount(drawn.row),
      annual_free: annualFree,
    });
  } catch (err) {
    if (err.code === 'draw_limit') return res.status(400).json({ error: 'draw_limit' });
    if (err.code === 'pool_too_small') return res.status(503).json({ error: 'pool_too_small' });
    if (err.code === 'draw_conflict') return res.status(409).json({ error: 'draw_conflict' });
    console.error('blindbox draw', err);
    return res.status(500).json({ error: 'Draw failed' });
  }
}
