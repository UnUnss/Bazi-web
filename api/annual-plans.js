// 包年方案云端同步：仅支持 Authorization Bearer
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false } }
);

async function assertUser(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const { data: { user }, error } = await sb.auth.getUser(token);
  if (!error && user?.email) {
    return { email: user.email.trim().toLowerCase(), userId: user.id };
  }
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
      // Match by email or user_id (payment fulfill writes both)
      const [byEmail, byUser] = await Promise.all([
        sb.from('annual_plans')
          .select('id, start_date, end_date, profile_ids, created_at')
          .eq('owner_email', email),
        sb.from('annual_plans')
          .select('id, start_date, end_date, profile_ids, created_at')
          .eq('user_id', userId),
      ]);
      if (byEmail.error) {
        console.error('annual-plans GET email error:', byEmail.error);
        return res.status(500).json({ error: 'Database error' });
      }
      if (byUser.error) {
        console.error('annual-plans GET user error:', byUser.error);
        return res.status(500).json({ error: 'Database error' });
      }
      const map = new Map();
      [...(byEmail.data || []), ...(byUser.data || [])].forEach((row) => {
        if (row?.id) map.set(row.id, row);
      });
      const plans = [...map.values()].sort((a, b) => {
        const ds = String(a.start_date).localeCompare(String(b.start_date));
        if (ds) return ds;
        return String(a.created_at || '').localeCompare(String(b.created_at || ''));
      });
      return res.status(200).json({ plans: plans.map(toClient) });
    }

    if (req.method === 'PUT' || req.method === 'POST') {
      const plans = Array.isArray(req.body?.plans) ? req.body.plans : null;
      if (!plans) return res.status(400).json({ error: 'Missing plans' });

      const rows = plans
        .filter((p) => p && p.id && p.start && p.end)
        .map((p) => toRow(p, email, userId));

      if (!rows.length) {
        const { error: delErr } = await sb
          .from('annual_plans')
          .delete()
          .eq('owner_email', email);
        if (delErr) {
          console.error('annual-plans DELETE error:', delErr);
          return res.status(500).json({ error: 'Database error' });
        }
        return res.status(200).json({ plans: [] });
      }

      // Upsert new/updated rows atomically
      const { error: upsertErr } = await sb
        .from('annual_plans')
        .upsert(rows, { onConflict: 'id' });
      if (upsertErr) {
        console.error('annual-plans UPSERT error:', upsertErr);
        return res.status(500).json({ error: 'Database error' });
      }

      // Delete rows no longer in the new list
      const newIds = new Set(rows.map((r) => r.id));
      const { data: existing } = await sb
        .from('annual_plans')
        .select('id')
        .eq('owner_email', email);
      const toDelete = (existing || []).filter((r) => !newIds.has(r.id)).map((r) => r.id);
      if (toDelete.length > 0) {
        const { error: delErr } = await sb
          .from('annual_plans')
          .delete()
          .eq('owner_email', email)
          .in('id', toDelete);
        if (delErr) {
          console.error('annual-plans cleanup DELETE error:', delErr);
          return res.status(500).json({ error: 'Database error' });
        }
      }

      const { data, error } = await sb
        .from('annual_plans')
        .select('id, start_date, end_date, profile_ids')
        .eq('owner_email', email)
        .order('start_date', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) {
        console.error('annual-plans final GET error:', error);
        return res.status(500).json({ error: 'Database error' });
      }
      return res.status(200).json({ plans: (data || []).map(toClient) });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('annual-plans error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
