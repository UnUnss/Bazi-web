// Vercel Serverless Function
// 验证管理员身份，生成 R2 预签名上传 URL
// 前端直接用这个 URL 上传文件，不经过本函数，绕过 Vercel 4.5MB 请求体限制

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
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

// 用 service_role key 验证用户 token（需在 Vercel 环境变量中配置 SUPABASE_SERVICE_KEY）
const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false } }
);

export default async function handler(req, res) {
  // 只接受 POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 1. 验证 Bearer token
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Missing token' });

  const { data: { user }, error: authErr } = await sb.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Unauthorized' });

  // 2. 检查 is_admin
  const { data: profile } = await sb
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_admin) return res.status(403).json({ error: 'Forbidden' });

  // 3. 生成预签名 URL
  const { filename, folder, contentType } = req.body;
  if (!filename || !folder) return res.status(400).json({ error: 'Missing params' });

  // R2 存储路径：wallpapers/{folder编号}/{文件名}
  const key = `wallpapers/${folder}/${filename}`;

  try {
    const url = await getSignedUrl(
      s3,
      new PutObjectCommand({
        Bucket:      process.env.R2_BUCKET_NAME,
        Key:         key,
        ContentType: contentType || 'image/jpeg',
      }),
      { expiresIn: 3600 } // 1小时有效
    );

    return res.status(200).json({ url, key });
  } catch (err) {
    console.error('presign error:', err);
    return res.status(500).json({ error: 'Failed to generate presigned URL' });
  }
}
