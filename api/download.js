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

  const { r2_key } = req.body || {};
  if (!r2_key || typeof r2_key !== 'string') {
    return res.status(400).json({ error: 'Missing r2_key' });
  }

  const sb = getServiceSupabase();

  // Verify r2_key exists in wallpapers table (prevents arbitrary R2 file access)
  const { data: byOriginal } = await sb
    .from('wallpapers')
    .select('id')
    .eq('r2_key', r2_key)
    .maybeSingle();
  if (!byOriginal) {
    const { data: byPreview } = await sb
      .from('wallpapers')
      .select('id')
      .eq('preview_key', r2_key)
      .maybeSingle();
    if (!byPreview) return res.status(403).json({ error: 'Forbidden' });
  }

  const allowed = await userCanDownloadKey({
    userId: auth.userId,
    email: auth.email,
    r2Key: r2_key,
  });
  if (!allowed) {
    return res.status(402).json({ error: 'Payment required' });
  }

  try {
    const url = await getSignedUrl(
      s3,
      new GetObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: r2_key,
      }),
      { expiresIn: 300 }
    );
    return res.status(200).json({ url });
  } catch (err) {
    console.error('download presign error:', err);
    return res.status(500).json({ error: 'Failed to generate download URL' });
  }
}
