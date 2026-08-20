// 已登录用户获取原图临时下载链接（Bearer）
// 授权：有效包年 或 已支付订单包含该 r2_key
//       或本月（节气月）已有下载记录 → 允许重新下载（包年/单购皆可）
// 邀请奖励不能兑换原图，只走带水印的免费下载。
// 可选：record_history=true 时由服务端写入 download_records（避免浏览器直连 Supabase 失败）
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Solar } from 'lunar-javascript';
import { assertUser } from './_lib/auth.js';
import { getServiceSupabase } from './_lib/supabase.js';
import { userCanDownloadKey } from './_lib/fulfill-order.js';

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** 与 landing / download-history 一致的当前节气月干支 */
function getCurrentMonthGanZhi() {
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

/** 本月已下载过该图 → 允许重新下载（不区分包年/单购） */
async function userHasCurrentMonthDownload(sb, { userId, email, r2Key }) {
  const month = getCurrentMonthGanZhi();
  if (!month || !r2Key) return false;
  const emailNorm = String(email || '').trim().toLowerCase();

  if (userId) {
    const { data } = await sb
      .from('download_records')
      .select('id')
      .eq('user_id', userId)
      .eq('r2_key', r2Key)
      .eq('month_ganzhi', month)
      .limit(1);
    if (data?.length) return true;
  }
  if (emailNorm) {
    const { data } = await sb
      .from('download_records')
      .select('id')
      .eq('owner_email', emailNorm)
      .eq('r2_key', r2Key)
      .eq('month_ganzhi', month)
      .limit(1);
    if (data?.length) return true;
  }
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
  };
  const { error } = await sb.from('download_records').insert(row);
  if (error) console.error('download_records insert failed', error);
}

export default async function handler(req, res) {
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
  const { data: byOriginal } = await sb
    .from('wallpapers')
    .select('id, r2_key')
    .eq('r2_key', r2_key)
    .maybeSingle();
  if (byOriginal?.r2_key) {
    originalKey = byOriginal.r2_key;
    wallpaperId = byOriginal.id || null;
  } else {
    // Try matching as preview_key (column may not exist in all deployments)
    let resolvedByPreview = null;
    try {
      const { data: byPreview } = await sb
        .from('wallpapers')
        .select('id, r2_key')
        .eq('preview_key', r2_key)
        .maybeSingle();
      resolvedByPreview = byPreview;
    } catch (_) {}
    if (resolvedByPreview?.r2_key) {
      originalKey = resolvedByPreview.r2_key;
      wallpaperId = resolvedByPreview.id || null;
    } else {
      return res.status(403).json({ error: 'Forbidden' });
    }
  }

  // 首次：包年绑定档案 或 已支付该图；重新下载：本月已有下载记录即可
  let allowed = await userCanDownloadKey({
    userId: auth.userId,
    email: auth.email,
    r2Key: originalKey,
    profileId: profileId ? String(profileId) : null,
  });
  if (!allowed) {
    allowed = await userHasCurrentMonthDownload(sb, {
      userId: auth.userId,
      email: auth.email,
      r2Key: originalKey,
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

    // 签发成功后再记下载记录；重新下载不传 record_history，避免重复写入
    if (recordHistory) {
      await recordDownload(sb, {
        userId: auth.userId,
        email: auth.email,
        wallpaperId,
        r2Key: originalKey,
        previewUrl,
        wallpaperName: wallpaperName || safeBase,
        monthGanzhi,
        profileId: profileId ? String(profileId) : null,
      });
    }

    return res.status(200).json({ url, r2_key: originalKey, filename: downloadName });
  } catch (err) {
    console.error('download presign error:', err);
    return res.status(500).json({ error: 'Failed to generate download URL' });
  }
}
