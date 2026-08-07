// 已登录用户获取原图临时下载链接（仅支持 Authorization Bearer）
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl }               from '@aws-sdk/s3-request-presigner';
import { createClient }               from '@supabase/supabase-js';

const s3 = new S3Client({
  region:   'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId:     process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false } }
);

async function assertUser(req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return { ok: false, status: 401, error: 'Login required' };
  const { data: { user }, error } = await sb.auth.getUser(token);
  if (error || !user) return { ok: false, status: 401, error: 'Login required' };
  return { ok: true, userId: user.id, email: user.email || '' };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const auth = await assertUser(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  const { r2_key } = req.body || {};
  if (!r2_key || typeof r2_key !== 'string') {
    return res.status(400).json({ error: 'Missing r2_key' });
  }

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

  try {
    const url = await getSignedUrl(
      s3,
      new GetObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key:    r2_key,
      }),
      { expiresIn: 300 } // 5 分钟有效
    );
    return res.status(200).json({ url });
  } catch (err) {
    console.error('download presign error:', err);
    return res.status(500).json({ error: 'Failed to generate download URL' });
  }
}
