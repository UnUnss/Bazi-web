// 模拟登录阶段：用 X-User-Email 标识用户，service_role 读写 bazi_profiles
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false } }
);

function requireEmail(req) {
  const email = (req.headers['x-user-email'] || '').trim().toLowerCase();
  if (!email || !email.includes('@')) return null;
  return email;
}

function toClient(row) {
  return {
    id: row.id,
    nickname: row.nickname,
    gender: row.gender,
    birthDate: row.birth_date,
    birthTime: row.birth_time,
    birthplace: row.birthplace,
    birthplaceLon: row.birthplace_lon,
    utcOffset: row.utc_offset,
    useTrueSolarTime: !!row.use_true_solar_time,
    useDST: !!row.use_dst,
  };
}

function toRow(profile, email) {
  return {
    nickname: profile.nickname,
    gender: Number(profile.gender),
    birth_date: profile.birthDate,
    birth_time: profile.birthTime,
    birthplace: profile.birthplace,
    birthplace_lon: profile.birthplaceLon ?? null,
    utc_offset: profile.utcOffset ?? null,
    use_true_solar_time: !!profile.useTrueSolarTime,
    use_dst: !!profile.useDST,
    owner_email: email,
    user_id: null,
  };
}

export default async function handler(req, res) {
  const email = requireEmail(req);
  if (!email) return res.status(401).json({ error: 'Login required' });

  try {
    if (req.method === 'GET') {
      const { data, error } = await sb
        .from('bazi_profiles')
        .select('*')
        .eq('owner_email', email)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ profiles: (data || []).map(toClient) });
    }

    if (req.method === 'POST') {
      const profile = req.body?.profile;
      if (!profile?.nickname || profile.gender === undefined || !profile.birthDate || !profile.birthTime || !profile.birthplace) {
        return res.status(400).json({ error: 'Missing profile fields' });
      }

      const row = toRow(profile, email);
      const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

      if (profile.id && uuidRe.test(profile.id)) {
        const { data, error } = await sb
          .from('bazi_profiles')
          .update(row)
          .eq('id', profile.id)
          .eq('owner_email', email)
          .select('*')
          .maybeSingle();
        if (error) return res.status(500).json({ error: error.message });
        if (data) return res.status(200).json({ profile: toClient(data) });

        const { data: inserted, error: insErr } = await sb
          .from('bazi_profiles')
          .insert({ id: profile.id, ...row })
          .select('*')
          .single();
        if (insErr) return res.status(500).json({ error: insErr.message });
        return res.status(200).json({ profile: toClient(inserted) });
      }

      const { data, error } = await sb
        .from('bazi_profiles')
        .insert(row)
        .select('*')
        .single();
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ profile: toClient(data) });
    }

    if (req.method === 'DELETE') {
      const id = req.body?.id;
      if (!id) return res.status(400).json({ error: 'Missing id' });
      const { error } = await sb
        .from('bazi_profiles')
        .delete()
        .eq('id', id)
        .eq('owner_email', email);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('bazi-profiles error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
