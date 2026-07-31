// 包年方案云端同步：Authorization Bearer 或 X-User-Email
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false } }
);

async function assertUser(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (token) {
    const { data: { user }, error } = await sb.auth.getUser(token);
    if (!error && user?.email) {
      return { email: user.email.trim().toLowerCase(), userId: user.id };
    }
  }
  const email = (req.headers['x-user-email'] || '').trim().toLowerCase();
  if (email && email.includes('@')) return { email, userId: null };
  return null;
}

function toClient(row) {
  const profileIds = Array.isArray(row.profile_ids)
    ? row.profile_ids.filter(Boolean).slice(0, 2)
    : [];
  return {
    id: row.id,
    start: row.start_date,
    end: row.end_date,
    profileIds,
  };
}

function toRow(plan, email, userId) {
  return {
    id: String(plan.id),
    owner_email: email,
    user_id: userId,
    start_date: plan.start,
    end_date: plan.end,
    profile_ids: Array.isArray(plan.profileIds)
      ? plan.profileIds.filter(Boolean).slice(0, 2)
      : [],
    updated_at: new Date().toISOString(),
  };
}

export default async function handler(req, res) {
  const auth = await assertUser(req);
  if (!auth) return res.status(401).json({ error: 'Login required' });
  const { email, userId } = auth;

  try {
    if (req.method === 'GET') {
      const { data, error } = await sb
        .from('annual_plans')
        .select('*')
        .eq('owner_email', email)
        .order('start_date', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ plans: (data || []).map(toClient) });
    }

    // 全量覆盖：与前端 saveAnnualPlans 对齐
    if (req.method === 'PUT' || req.method === 'POST') {
      const plans = Array.isArray(req.body?.plans) ? req.body.plans : null;
      if (!plans) return res.status(400).json({ error: 'Missing plans' });

      const rows = plans
        .filter((p) => p && p.id && p.start && p.end)
        .map((p) => toRow(p, email, userId));

      const { error: delErr } = await sb
        .from('annual_plans')
        .delete()
        .eq('owner_email', email);
      if (delErr) return res.status(500).json({ error: delErr.message });

      if (!rows.length) {
        return res.status(200).json({ plans: [] });
      }

      const { data, error } = await sb
        .from('annual_plans')
        .insert(rows)
        .select('*');
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ plans: (data || []).map(toClient) });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('annual-plans error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
