// 鉴权：Authorization Bearer（Supabase）
import { assertUser } from './_lib/auth.js';
import { getServiceSupabase } from './_lib/supabase.js';

function normalizeWallpaperHistory(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof k !== 'string' || !k) continue;
    if (!Array.isArray(v)) continue;
    out[k] = v.filter((id) => id != null && id !== '').map(String);
  }
  return out;
}

/** 只保留指定流年前缀的记录（如 yearGanZhi='丙午' → 键以 '丙午|' 开头） */
function pruneWallpaperHistory(raw, yearGanZhi) {
  const all = normalizeWallpaperHistory(raw);
  if (!yearGanZhi) return all;
  const prefix = `${yearGanZhi}|`;
  const out = {};
  for (const [k, v] of Object.entries(all)) {
    if (k.indexOf(prefix) === 0) out[k] = v;
  }
  return out;
}

const PROFILE_COLS =
  'id, nickname, gender, birth_date, birth_time, birthplace, birthplace_lon, utc_offset, use_true_solar_time, use_dst, country_code, state_code, city_name, wallpaper_history';

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
    countryCode: row.country_code || '',
    stateCode: row.state_code || '',
    cityName: row.city_name || '',
    wallpaperHistory: normalizeWallpaperHistory(row.wallpaper_history),
  };
}

function toRow(profile, email, userId) {
  const row = {
    nickname: profile.nickname,
    gender: Number(profile.gender),
    birth_date: profile.birthDate,
    birth_time: profile.birthTime,
    birthplace: profile.birthplace,
    birthplace_lon: profile.birthplaceLon ?? null,
    utc_offset: profile.utcOffset ?? null,
    use_true_solar_time: !!profile.useTrueSolarTime,
    use_dst: !!profile.useDST,
    country_code: profile.countryCode || null,
    state_code: profile.stateCode || null,
    city_name: profile.cityName || null,
    owner_email: email,
    user_id: userId,
  };
  // 未显式传入时不覆盖库里的壁纸历史，避免普通 upsert 把字段抹空
  if (profile.wallpaperHistory !== undefined) {
    row.wallpaper_history = normalizeWallpaperHistory(profile.wallpaperHistory);
  }
  return row;
}

export default async function handler(req, res) {
  const auth = await assertUser(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
  const { email, userId } = auth;
  const sb = getServiceSupabase();

  try {
    if (req.method === 'GET') {
      const { data, error } = await sb
        .from('bazi_profiles')
        .select(PROFILE_COLS)
        .eq('owner_email', email)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) {
        console.error('bazi-profiles GET error:', error);
        return res.status(500).json({ error: 'Database error', detail: error.message });
      }
      return res.status(200).json({ profiles: (data || []).map(toClient) });
    }

    // 仅更新壁纸历史（本月选图后调用）
    if (req.method === 'PATCH') {
      const id = req.body?.id;
      const wallpaperHistory = req.body?.wallpaperHistory;
      const yearGanZhi = req.body?.yearGanZhi || null;
      if (!id) return res.status(400).json({ error: 'Missing id' });
      if (wallpaperHistory === undefined) {
        return res.status(400).json({ error: 'Missing wallpaperHistory' });
      }

      const pruned = pruneWallpaperHistory(wallpaperHistory, yearGanZhi);
      const { data, error } = await sb
        .from('bazi_profiles')
        .update({ wallpaper_history: pruned })
        .eq('id', id)
        .eq('owner_email', email)
        .select(PROFILE_COLS)
        .maybeSingle();
      if (error) {
        console.error('bazi-profiles PATCH error:', error);
        return res.status(500).json({ error: 'Database error', detail: error.message });
      }
      if (!data) return res.status(404).json({ error: 'Profile not found' });
      return res.status(200).json({ profile: toClient(data) });
    }

    if (req.method === 'POST') {
      const profile = req.body?.profile;
      if (!profile?.nickname || profile.gender === undefined || !profile.birthDate || !profile.birthTime || !profile.birthplace) {
        return res.status(400).json({ error: 'Missing profile fields' });
      }

      const row = toRow(profile, email, userId);
      const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

      if (profile.id && uuidRe.test(profile.id)) {
        const { data, error } = await sb
          .from('bazi_profiles')
          .update(row)
          .eq('id', profile.id)
          .eq('owner_email', email)
          .select(PROFILE_COLS)
          .maybeSingle();
        if (error) {
          console.error('bazi-profiles POST update error:', error);
          return res.status(500).json({ error: 'Database error', detail: error.message });
        }
        if (data) return res.status(200).json({ profile: toClient(data) });

        const { data: inserted, error: insErr } = await sb
          .from('bazi_profiles')
          .insert({ id: profile.id, ...row })
          .select(PROFILE_COLS)
          .single();
        if (insErr) {
          console.error('bazi-profiles POST insert error:', insErr);
          return res.status(500).json({ error: 'Database error', detail: insErr.message });
        }
        return res.status(200).json({ profile: toClient(inserted) });
      }

      const { data, error } = await sb
        .from('bazi_profiles')
        .insert(row)
        .select(PROFILE_COLS)
        .single();
      if (error) {
        console.error('bazi-profiles POST insert error:', error);
        return res.status(500).json({ error: 'Database error', detail: error.message });
      }
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
      if (error) {
        console.error('bazi-profiles DELETE error:', error);
        return res.status(500).json({ error: 'Database error', detail: error.message });
      }
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('bazi-profiles error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
