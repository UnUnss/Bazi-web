import { getServiceSupabase } from './supabase.js';
import { getInviteStatus, consumeInviteReward } from './invite-campaign.js';

function sanitizeText(raw, max) {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s) return null;
  return s.slice(0, max);
}

function isMissingTableError(error) {
  const code = String(error && error.code || '');
  const msg = String(error && error.message || '');
  return code === '42P01' || code === 'PGRST205'
    || /does not exist|schema cache/i.test(msg);
}

function errCode(error) {
  if (!error) return 'insert_failed';
  if (typeof error === 'string') return error;
  if (isMissingTableError(error)) return 'table_missing';
  return error.message || error.code || 'insert_failed';
}

export async function resolveWallpaper(sb, r2Key) {
  const { data: byOriginal } = await sb
    .from('wallpapers')
    .select('id, r2_key')
    .eq('r2_key', r2Key)
    .maybeSingle();
  if (byOriginal?.r2_key) {
    return { wallpaperId: byOriginal.id || null, originalKey: byOriginal.r2_key };
  }
  try {
    const { data: byPreview } = await sb
      .from('wallpapers')
      .select('id, r2_key')
      .eq('preview_key', r2Key)
      .maybeSingle();
    if (byPreview?.r2_key) {
      return { wallpaperId: byPreview.id || null, originalKey: byPreview.r2_key };
    }
  } catch (_) {}
  return { wallpaperId: null, originalKey: r2Key };
}

export async function insertFreeDownloadLog(sb, {
  userId,
  email,
  wallpaperId,
  r2Key,
  wallpaperName,
  source,
}) {
  if (!r2Key || (source !== 'free' && source !== 'invite')) return { ok: false };
  const { error } = await sb.from('free_download_logs').insert({
    user_id: userId || null,
    owner_email: String(email || '').trim().toLowerCase(),
    wallpaper_id: wallpaperId || null,
    r2_key: r2Key,
    wallpaper_name: sanitizeText(wallpaperName, 120),
    source,
  });
  if (error) {
    if (error.code === '23505') return { ok: true, duplicate: true };
    console.error('free_download_logs insert failed', error);
    return { ok: false, error: errCode(error) };
  }
  return { ok: true };
}

/** 水印免费图：第一次记 free，第二次（需已邀请满 3 人）记 invite。 */
export async function logWatermarkedFreeDownload({ userId, email, r2Key, wallpaperName }) {
  const sb = getServiceSupabase();
  const { wallpaperId, originalKey } = await resolveWallpaper(sb, r2Key);

  if (!userId) return { ok: false, error: 'no_user' };
  const { data: existing, error: selectErr } = await sb
    .from('free_download_logs')
    .select('id, source, r2_key')
    .eq('user_id', userId);
  if (selectErr) {
    console.error('free_download_logs select failed', selectErr);
    return { ok: false, error: errCode(selectErr) };
  }

  const rows = existing || [];
  if (rows.some((r) => r.r2_key === originalKey)) {
    return { ok: true, duplicate: true };
  }
  // 已经有 2 条记录（free + invite），下载次数已用完
  if (rows.length >= 2) {
    return { ok: false, error: 'exhausted' };
  }

  const freeCount = rows.filter((r) => r.source === 'free').length;
  let source = 'free';
  if (freeCount >= 1) {
    const invite = await getInviteStatus(userId);
    // 只有 rewardStatus === 'granted'（已发放但未使用）才允许
    const hasInvite = Number(invite && invite.successCount || 0) >= 3
      || invite.rewardStatus === 'granted';
    if (!hasInvite) return { ok: false, error: 'need_invite' };
    source = 'invite';
  }

  const result = await insertFreeDownloadLog(sb, {
    userId,
    email,
    wallpaperId,
    r2Key: originalKey,
    wallpaperName,
    source,
  });
  if (result.ok && source === 'invite' && !result.duplicate) {
    await consumeInviteReward(userId);
  }
  return { ...result, source };
}
