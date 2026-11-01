import { Solar } from 'lunar-javascript';

export const COLLECT_ORDER = ['金', '木', '水', '火', '土'];
const FOLDER_ELEMENT = { 141: '水', 142: '木', 143: '火', 144: '土', 145: '金' };
const GAN = '甲乙丙丁戊己庚辛壬癸';
const ZHI = '子丑寅卯辰巳午未申酉戌亥';

export function getCurrentMonthGanZhi() {
  try {
    const now = new Date();
    const ec = Solar.fromYmdHms(
      now.getFullYear(), now.getMonth() + 1, now.getDate(),
      now.getHours(), now.getMinutes(), now.getSeconds()
    ).getLunar().getEightChar();
    return ec.getMonthGan() + ec.getMonthZhi();
  } catch (_) {
    return '';
  }
}

function isMonthGanZhi(value) {
  const s = String(value || '').trim();
  return s.length === 2 && GAN.indexOf(s[0]) >= 0 && ZHI.indexOf(s[1]) >= 0;
}

function monthGanZhiAtUtcOffsetHours(now, offsetHours) {
  const local = new Date(now.getTime() + offsetHours * 3600000);
  const ec = Solar.fromYmdHms(
    local.getUTCFullYear(), local.getUTCMonth() + 1, local.getUTCDate(),
    local.getUTCHours(), local.getUTCMinutes(), local.getUTCSeconds()
  ).getLunar().getEightChar();
  return ec.getMonthGan() + ec.getMonthZhi();
}

/** 采用页面专属壁纸正在显示的流月；仅接受此刻各时区墙上时钟可能算出的月柱。 */
export function resolveDisplayedMonthGanZhi(displayedMonth, now = new Date()) {
  const requested = String(displayedMonth || '').trim();
  if (isMonthGanZhi(requested)) {
    const allowed = new Set();
    for (let h = -12; h <= 14; h++) {
      try { allowed.add(monthGanZhiAtUtcOffsetHours(now, h)); } catch (_) {}
    }
    if (allowed.has(requested)) return requested;
  }
  return getCurrentMonthGanZhi();
}

function todayYMD() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export async function hasActiveAnnual(sb, { userId, email }) {
  const emailNorm = String(email || '').trim().toLowerCase();
  const today = todayYMD();
  if (userId) {
    const { data } = await sb
      .from('annual_plans')
      .select('id')
      .eq('user_id', userId)
      .lte('start_date', today)
      .gte('end_date', today)
      .limit(1);
    if (data?.length) return true;
  }
  if (emailNorm) {
    const { data } = await sb
      .from('annual_plans')
      .select('id')
      .eq('owner_email', emailNorm)
      .lte('start_date', today)
      .gte('end_date', today)
      .limit(1);
    if (data?.length) return true;
  }
  return false;
}

export function wallpaperElement(row) {
  if (row?.element && COLLECT_ORDER.indexOf(row.element) >= 0) return row.element;
  const folder = Number(row?.folder_number);
  return FOLDER_ELEMENT[folder] || '';
}

export function emptyOwned() {
  return { 金: 0, 木: 0, 水: 0, 火: 0, 土: 0 };
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function loadBlindboxPool(sb) {
  const { data, error } = await sb
    .from('wallpapers')
    .select('id, element, r2_key, preview_key, folder_number, pool')
    .eq('pool', 'blindbox');
  if (error) {
    console.error('blindbox pool error', error);
    return [];
  }
  return data || [];
}

export async function loadCardsByIds(sb, ids) {
  const list = (ids || []).filter(Boolean);
  if (!list.length) return [];
  const { data, error } = await sb
    .from('wallpapers')
    .select('id, element, r2_key, preview_key, folder_number, pool')
    .in('id', list);
  if (error) {
    console.error('blindbox cards error', error);
    return [];
  }
  const byId = {};
  (data || []).forEach((w) => { byId[String(w.id)] = w; });
  return list.map((id) => byId[String(id)]).filter(Boolean);
}

export async function pickFour(sb, openedIds) {
  const pool = await loadBlindboxPool(sb);
  if (pool.length < 4) {
    const err = new Error('pool_too_small');
    err.code = 'pool_too_small';
    throw err;
  }
  const opened = new Set((openedIds || []).map(String));
  const fresh = shuffle(pool.filter((w) => !opened.has(String(w.id))));
  const used = shuffle(pool.filter((w) => opened.has(String(w.id))));
  const picked = [];
  const seen = new Set();
  for (const w of fresh.concat(used)) {
    const id = String(w.id);
    if (seen.has(id)) continue;
    seen.add(id);
    picked.push(w);
    if (picked.length === 4) break;
  }
  if (picked.length < 4) {
    const err = new Error('pool_too_small');
    err.code = 'pool_too_small';
    throw err;
  }
  return picked;
}

export async function getOrCreateMonth(sb, userId, month) {
  const { data: existing, error } = await sb
    .from('blindbox_months')
    .select('*')
    .eq('user_id', userId)
    .eq('month_ganzhi', month)
    .maybeSingle();
  if (error) {
    console.error('blindbox month fetch', error);
    throw error;
  }
  if (existing) return existing;
  const { data: created, error: insErr } = await sb
    .from('blindbox_months')
    .insert({
      user_id: userId,
      month_ganzhi: month,
      draw_count: 0,
      current_ids: [],
      opened_ids: [],
    })
    .select('*')
    .single();
  if (insErr) {
    const { data: again } = await sb
      .from('blindbox_months')
      .select('*')
      .eq('user_id', userId)
      .eq('month_ganzhi', month)
      .maybeSingle();
    if (again) return again;
    throw insErr;
  }
  return created;
}

export function unusedCreditCount(row) {
  if (!row) return 0;
  let n = 0;
  if (row.draw_count >= 2 && !row.credit2_used) n++;
  if (row.draw_count >= 3 && !row.credit3_used) n++;
  return n;
}

export async function applyDraw(sb, userId, month) {
  const row = await getOrCreateMonth(sb, userId, month);
  if (row.draw_count >= 3) {
    const err = new Error('draw_limit');
    err.code = 'draw_limit';
    throw err;
  }
  const cards = await pickFour(sb, row.opened_ids || []);
  const ids = cards.map((c) => c.id);
  const opened = [...new Set([...(row.opened_ids || []), ...ids])];
  const { data: updated, error } = await sb
    .from('blindbox_months')
    .update({
      draw_count: row.draw_count + 1,
      current_ids: ids,
      opened_ids: opened,
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id)
    .eq('draw_count', row.draw_count)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  if (!updated) {
    const err = new Error('draw_conflict');
    err.code = 'draw_conflict';
    throw err;
  }
  return { row: updated, cards };
}

export async function consumeCredits(sb, userId, month, count) {
  const n = Math.max(0, Number(count) || 0);
  if (n < 1) return;
  const row = await getOrCreateMonth(sb, userId, month);
  const patch = { updated_at: new Date().toISOString() };
  let left = n;
  if (row.draw_count >= 3 && !row.credit3_used && left > 0) {
    patch.credit3_used = true;
    left--;
  }
  if (row.draw_count >= 2 && !row.credit2_used && left > 0) {
    patch.credit2_used = true;
    left--;
  }
  await sb.from('blindbox_months').update(patch).eq('id', row.id);
}

export async function getOwnedBlindboxStats(sb, userId) {
  const owned = emptyOwned();
  const ownedKeys = [];
  const ownedIds = [];
  const downloadedKeys = [];
  const downloadedIds = [];
  const { data: recs, error } = await sb
    .from('download_records')
    .select('wallpaper_id, r2_key, source')
    .eq('user_id', userId);
  if (error) {
    console.error('blindbox owned error', error);
    return {
      owned,
      owned_keys: ownedKeys,
      owned_ids: ownedIds,
      downloaded_keys: downloadedKeys,
      downloaded_ids: downloadedIds,
    };
  }
  const rows = recs || [];
  if (!rows.length) {
    return {
      owned,
      owned_keys: ownedKeys,
      owned_ids: ownedIds,
      downloaded_keys: downloadedKeys,
      downloaded_ids: downloadedIds,
    };
  }
  const eligibleKeys = new Set(
    rows
      .filter((r) => r.source !== 'redeem' && r.source !== 'annual')
      .map((r) => r.r2_key)
      .filter(Boolean)
  );
  const keys = [...new Set(rows.map((r) => r.r2_key).filter(Boolean))];
  if (!keys.length) {
    return {
      owned,
      owned_keys: ownedKeys,
      owned_ids: ownedIds,
      downloaded_keys: downloadedKeys,
      downloaded_ids: downloadedIds,
    };
  }
  const { data: walls } = await sb
    .from('wallpapers')
    .select('id, r2_key, element, pool, folder_number')
    .in('r2_key', keys);
  const seenOwned = new Set();
  const seenDownloaded = new Set();
  (walls || []).forEach((w) => {
    const folder = Number(w.folder_number);
    const isBlind = w.pool === 'blindbox' || (folder >= 141 && folder <= 145);
    if (!isBlind) return;
    const id = String(w.id || w.r2_key);
    if (!seenDownloaded.has(id)) {
      seenDownloaded.add(id);
      if (w.r2_key) downloadedKeys.push(w.r2_key);
      if (w.id) downloadedIds.push(String(w.id));
    }
    if (!eligibleKeys.has(w.r2_key)) return;
    if (seenOwned.has(id)) return;
    seenOwned.add(id);
    const el = wallpaperElement(w);
    if (owned[el] != null) owned[el] += 1;
    if (w.r2_key) ownedKeys.push(w.r2_key);
    if (w.id) ownedIds.push(String(w.id));
  });
  return {
    owned,
    owned_keys: ownedKeys,
    owned_ids: ownedIds,
    downloaded_keys: downloadedKeys,
    downloaded_ids: downloadedIds,
  };
}

export async function getOwnedElementCounts(sb, userId) {
  return (await getOwnedBlindboxStats(sb, userId)).owned;
}

export async function getRedeemCount(sb, userId) {
  const { count, error } = await sb
    .from('blindbox_redeems')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);
  if (error) {
    console.error('blindbox redeem count', error);
    return 0;
  }
  return count || 0;
}

export function redeemAvailable(owned, redeemed) {
  const sets = Math.min(...COLLECT_ORDER.map((el) => owned[el] || 0));
  return Math.max(0, sets - (redeemed || 0));
}

export function publicCard(row, r2Public) {
  if (!row) return null;
  const el = wallpaperElement(row);
  const preview = row.preview_key || row.r2_key;
  return {
    id: row.id,
    element: el,
    r2_key: row.r2_key,
    preview_key: row.preview_key || '',
    preview_url: preview && r2Public ? `${r2Public}/${preview}` : '',
  };
}

export async function buildBlindboxState(sb, { userId, email, monthGanZhi }) {
  const month = resolveDisplayedMonthGanZhi(monthGanZhi);
  const [annualFree, stats, redeemed, row] = await Promise.all([
    hasActiveAnnual(sb, { userId, email }),
    getOwnedBlindboxStats(sb, userId),
    getRedeemCount(sb, userId),
    month ? getOrCreateMonth(sb, userId, month) : Promise.resolve(null),
  ]);
  const owned = stats.owned;
  const extra = {
    owned,
    owned_keys: stats.owned_keys,
    owned_ids: stats.owned_ids,
    downloaded_keys: stats.downloaded_keys,
    downloaded_ids: stats.downloaded_ids,
    redeemed,
    redeem_available: 0,
    annual_free: annualFree,
  };
  if (!month || !row) {
    return {
      month_ganzhi: month || '',
      draw_count: 0,
      cards: [],
      unused_credits: 0,
      ...extra,
    };
  }
  const cards = await loadCardsByIds(sb, row.current_ids || []);
  const r2Public = (process.env.R2_PUBLIC_URL || 'https://pub-9caba4113e9842559ae43c91003a0b05.r2.dev').replace(/\/$/, '');
  return {
    month_ganzhi: month,
    draw_count: row.draw_count || 0,
    cards: cards.map((c) => publicCard(c, r2Public)).filter(Boolean),
    unused_credits: unusedCreditCount(row),
    ...extra,
  };
}
