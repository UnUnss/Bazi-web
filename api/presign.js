// Vercel Serverless Function
// 验证管理员身份，生成 R2 预签名上传 URL
// 前端直接用这个 URL 上传文件，不经过本函数，绕过 Vercel 4.5MB 请求体限制
//
// 鉴权：Authorization: Bearer <supabase access_token>，且 profiles.is_admin = true

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

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false } }
);

async function assertAdmin(req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return { ok: false, status: 401, error: 'Unauthorized' };
  const { data: { user }, error } = await sb.auth.getUser(token);
  if (error || !user) return { ok: false, status: 401, error: 'Unauthorized' };
  const { data: profile } = await sb.from('profiles').select('is_admin').eq('id', user.id).maybeSingle();
  if (profile?.is_admin) return { ok: true };
  if (user.email) {
    const { data: isAdmin } = await sb.rpc('is_admin_email', { check_email: user.email });
    if (isAdmin === true) return { ok: true };
  }
  return { ok: false, status: 403, error: 'Forbidden' };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await assertAdmin(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  const { filename, folder, contentType, variant, bodyBase64 } = req.body;
  if (!filename || !folder) return res.status(400).json({ error: 'Missing params' });

  // Sanitize: folder must be digits only; strip path separators from filename
  const safeFolder = String(folder).replace(/[^0-9]/g, '');
  if (!safeFolder) return res.status(400).json({ error: 'Invalid folder' });
  const safeName = String(filename).replace(/^.*[\\/]/, '');

  // variant=preview → wallpapers/{folder}/preview/{name}
  // variant=preview-free → wallpapers/{folder}/preview-free/{name}
  // 默认原图 → wallpapers/{folder}/{name}
  const key = variant === 'preview'
    ? `wallpapers/${safeFolder}/preview/${safeName}`
    : variant === 'preview-free'
    ? `wallpapers/${safeFolder}/preview-free/${safeName}`
    : `wallpapers/${safeFolder}/${safeName}`;

  try {
    // 预览图很小，由服务端直传，避开浏览器对 R2 PUT 的 CORS
    if (bodyBase64) {
      if (variant !== 'preview' && variant !== 'preview-free') {
        return res.status(400).json({ error: 'direct put is only allowed for preview' });
      }
      const buf = Buffer.from(String(bodyBase64), 'base64');
      if (!buf.length || buf.length > 3.5 * 1024 * 1024) {
        return res.status(400).json({ error: 'invalid preview body' });
      }
      await s3.send(new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        Body: buf,
        ContentType: contentType || 'image/jpeg',
      }));
      return res.status(200).json({ key });
    }

    const url = await getSignedUrl(
      s3,
      new PutObjectCommand({
        Bucket:      process.env.R2_BUCKET_NAME,
        Key:         key,
        ContentType: contentType || 'image/jpeg',
      }),
      { expiresIn: 3600 }
    );

    return res.status(200).json({ url, key });
  } catch (err) {
    console.error('presign error:', err);
    return res.status(500).json({ error: 'Failed to generate presigned URL' });
  }
}
