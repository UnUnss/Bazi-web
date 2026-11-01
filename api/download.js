// 已登录用户获取原图临时下载链接（Bearer）
// 授权：有效包年 或 已支付订单包含该 r2_key
//       或已有下载记录（专属图限本流月；盲盒不限流月）→ 允许重新下载

// 邀请奖励不能兑换原图，只走带水印的免费下载。
// 可选：record_history=true 时由服务端写入 download_records（避免浏览器直连 Supabase 失败）
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { assertUser } from './_lib/auth.js';
import { getServiceSupabase } from './_lib/supabase.js';
import { userCanDownloadKey } from './_lib/fulfill-order.js';
import {
  hasActiveAnnual,
  resolveDisplayedMonthGanZhi,
} from './_lib/blindbox.js';

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** 已有下载记录 → 允许重新下载。专属图仅本流月；盲盒不限流月。 */
async function userHasDownloadRecord(sb, { userId, email, r2Key, currentMonthOnly, monthGanzhi }) {
  if (!r2Key) return false;
  const emailNorm = String(email || '').trim().toLowerCase();
  const month = currentMonthOnly ? resolveDisplayedMonthGanZhi(monthGanzhi) : '';
  if (currentMonthOnly && !month) return false;

  async function find(column, value) {
    let q = sb.from('download_records').select('id').eq(column, value).eq('r2_key', r2Key);
    if (currentMonthOnly) q = q.eq('month_ganzhi', month);
    const { data } = await q.limit(1);
    return !!data?.length;
  }

  if (userId && await find('user_id', userId)) return true;
  if (emailNorm && await find('owner_email', emailNorm)) return true;
  return false;
}

function sanitizePreviewUrl(raw) {
  if (typeof raw !== 'string') return null;
  const url = raw.trim();
  if (!url || url.length > 500) return null;
  // 只存公网预览图，不存带签名参数的临时下载链
  if (/[?&](X-Amz-|Signature=|token=)/i.test(url)) return null;
  if (!/^https?:\/\//i.test(url)) return null;
  return url;
}

function sanitizeText(raw, max) {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s) return null;
  return s.slice(0, max);
}

async function recordDownload(sb, {
  userId,
  email,
  wallpaperId,
  r2Key,
  previewUrl,
  wallpaperName,
  monthGanzhi,
  profileId,
  source,
}) {
  const row = {
    user_id: userId,
    owner_email: email || '',
    wallpaper_id: wallpaperId || null,
    r2_key: r2Key,
    preview_url: sanitizePreviewUrl(previewUrl),
    wallpaper_name: sanitizeText(wallpaperName, 120),
    month_ganzhi: sanitizeText(monthGanzhi, 16),
    profile_id: profileId && UUID_RE.test(profileId) ? profileId : null,
    source: source || 'purchase',
  };
  const { error } = await sb.from('download_records').insert(row);
  if (error) console.error('download_records insert failed', error);
}

/** 壁纸下载次数：免费水印图 + 付费/包年原图（含专属与盲盒）。 */
async function wallpaperDownloadCount(sb) {
  const [freeRes, paidRes] = await Promise.all([
    sb.from('free_download_logs').select('id', { count: 'exact', head: true }),
    sb.from('download_records').select('id', { count: 'exact', head: true }),
  ]);
  if (freeRes.error && paidRes.error) {
    throw new Error(paidRes.error.message || freeRes.error.message || 'count failed');
  }
  const free = freeRes.error ? 0 : (freeRes.count || 0);
  const paid = paidRes.error ? 0 : (paidRes.count || 0);
  return Math.max(0, free + paid);
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const sb = getServiceSupabase();
      const count = await wallpaperDownloadCount(sb);
      res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300');
      return res.status(200).json({ count });
    } catch (err) {
      console.error('download stats error:', err);
      return res.status(500).json({ error: 'Failed to load download stats' });
    }
  }

  if (req.method !== 'POST') return res.status(405).end();

  const auth = await assertUser(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  const body = req.body || {};
  const {
    r2_key,
    profile_id: profileId,
    filename: rawName,
    record_history: recordHistory,
    preview_url: previewUrl,
    wallpaper_name: wallpaperName,
    month_ganzhi: monthGanzhi,
  } = body;
  if (!r2_key || typeof r2_key !== 'string') {
    return res.status(400).json({ error: 'Missing r2_key' });
  }

  // Safe download filename for Content-Disposition
  const safeBase = String(rawName || 'wallpaper')
    .replace(/[\\/:*?"<>|\r\n]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'wallpaper';
  const keyExt = (String(r2_key).match(/\.(jpe?g|png|webp)$/i) || [])[1];
  const ext = keyExt ? `.${keyExt.toLowerCase().replace('jpeg', 'jpg')}` : '.jpg';
  const downloadName = /\.(jpe?g|png|webp)$/i.test(safeBase) ? safeBase : `${safeBase}${ext}`;
  const asciiName = downloadName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_') || 'wallpaper.jpg';
  const utf8Name = encodeURIComponent(downloadName);
  const contentDisposition = `attachment; filename="${asciiName}"; filename*=UTF-8''${utf8Name}`;

  const sb = getServiceSupabase();

  // Verify r2_key exists in wallpapers table (prevents arbitrary R2 file access)
  // wallpapers may not have a separate preview_key column; treat r2_key match as sufficient
  let originalKey = r2_key;
  let wallpaperId = null;
  let wallpaperPool = 'match';
  let wallpaperFolder = null;
  const { data: byOriginal } = await sb
    .from('wallpapers')
    .select('id, r2_key, pool, folder_number')
    .eq('r2_key', r2_key)
    .maybeSingle();
  if (byOriginal?.r2_key) {
    originalKey = byOriginal.r2_key;
    wallpaperId = byOriginal.id || null;
    wallpaperPool = byOriginal.pool || 'match';
    wallpaperFolder = byOriginal.folder_number;
  } else {
    // Try matching as preview_key (column may not exist in all deployments)
    let resolvedByPreview = null;
    try {
      const { data: byPreview } = await sb
        .from('wallpapers')
        .select('id, r2_key, pool, folder_number')
        .eq('preview_key', r2_key)
        .maybeSingle();
      resolvedByPreview = byPreview;
    } catch (_) {}
    if (resolvedByPreview?.r2_key) {
      originalKey = resolvedByPreview.r2_key;
      wallpaperId = resolvedByPreview.id || null;
      wallpaperPool = resolvedByPreview.pool || 'match';
      wallpaperFolder = resolvedByPreview.folder_number;
    } else {
      return res.status(403).json({ error: 'Forbidden' });
    }
  }

  // 首次：包年（盲盒按账号；专属需绑定档案）或已支付该图；重新下载：专属图看本流月记录，盲盒不限流月
  const folder = Number(wallpaperFolder);
  const isBlindbox = wallpaperPool === 'blindbox' || (folder >= 141 && folder <= 145);
  let downloadSource = 'purchase';
  let allowed = await userCanDownloadKey({
    userId: auth.userId,
    email: auth.email,
    r2Key: originalKey,
    profileId: profileId ? String(profileId) : null,
    wallpaperPool: isBlindbox ? 'blindbox' : wallpaperPool,
  });
  if (allowed && isBlindbox) {
    const annual = await hasActiveAnnual(sb, {
      userId: auth.userId,
      email: auth.email,
    });
    if (annual) downloadSource = 'annual';
  }
  if (!allowed) {
    allowed = await userHasDownloadRecord(sb, {
      userId: auth.userId,
      email: auth.email,
      r2Key: originalKey,
      currentMonthOnly: !isBlindbox,
      monthGanzhi,
    });
  }
  if (!allowed) {
    return res.status(402).json({ error: 'Payment required' });
  }

  try {
    // ResponseContentDisposition forces browser download (not inline preview)
    // when CORS blob-fetch fails and we fall back to opening the signed URL.
    const url = await getSignedUrl(
      s3,
      new GetObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: originalKey,
        ResponseContentDisposition: contentDisposition,
      }),
      { expiresIn: 300 }
    );

    // 签发成功后再记下载记录；已有记录的重新下载不重复写入
    const alreadyRecorded = await userHasDownloadRecord(sb, {
      userId: auth.userId,
      email: auth.email,
      r2Key: originalKey,
      currentMonthOnly: !isBlindbox,
      monthGanzhi,
    });
    const shouldRecord = (recordHistory || downloadSource === 'annual') && !alreadyRecorded;
    if (shouldRecord) {
      await recordDownload(sb, {
        userId: auth.userId,
        email: auth.email,
        wallpaperId,
        r2Key: originalKey,
        previewUrl,
        wallpaperName: wallpaperName || safeBase,
        monthGanzhi,
        profileId: profileId ? String(profileId) : null,
        source: downloadSource,
      });
    }

    return res.status(200).json({ url, r2_key: originalKey, filename: downloadName });
  } catch (err) {
    console.error('download presign error:', err);
    return res.status(500).json({ error: 'Failed to generate download URL' });
  }
}
