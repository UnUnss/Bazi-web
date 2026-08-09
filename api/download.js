// 已登录用户获取原图临时下载链接（Bearer）
// 授权：有效包年 或 已支付订单包含该 r2_key
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const auth = await assertUser(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  const { r2_key, profile_id: profileId, filename: rawName } = req.body || {};
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
  const { data: byOriginal } = await sb
    .from('wallpapers')
    .select('id, r2_key')
    .eq('r2_key', r2_key)
    .maybeSingle();
  if (byOriginal?.r2_key) {
    originalKey = byOriginal.r2_key;
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
    } else {
      return res.status(403).json({ error: 'Forbidden' });
    }
  }

  const allowed = await userCanDownloadKey({
    userId: auth.userId,
    email: auth.email,
    r2Key: originalKey,
    profileId: profileId ? String(profileId) : null,
  });
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
    return res.status(200).json({ url, r2_key: originalKey, filename: downloadName });
  } catch (err) {
    console.error('download presign error:', err);
    return res.status(500).json({ error: 'Failed to generate download URL' });
  }
}
