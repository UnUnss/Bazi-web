// 已登录用户获取原图临时下载链接
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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Login required' });

  const { data: { user }, error } = await sb.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: 'Login required' });

  const { r2_key } = req.body;
  if (!r2_key) return res.status(400).json({ error: 'Missing r2_key' });

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
