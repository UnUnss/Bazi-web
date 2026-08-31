// Admin wallpaper: presign / meta / delete — one Vercel function (Hobby ≤12).
// Paths: POST /api/admin?fn=presign|meta|delete
// Rewrites keep /api/presign, /api/wallpaper-meta, /api/wallpaper-delete.
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { adminSb, assertAdmin } from './_lib/assert-admin.js';

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const VALID_ELEMENTS = new Set(['金', '木', '水', '火', '土']);
const VALID_TAGS = new Set(['人缘运', '才华运', '财富运', '感情运', '事业运', '健康运', '贵人运']);
const BLINDBOX_FOLDER_ELEMENT = {
  141: '水',
  142: '木',
  143: '火',
  144: '土',
  145: '金',
};
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fnName(req) {
  const q = req.query || {};
  const body = req.body || {};
  return String(q.fn || body.fn || '').toLowerCase();
}

async function handlePresign(req, res) {
  const { filename, folder, contentType, variant, bodyBase64 } = req.body || {};
  if (!filename || !folder) return res.status(400).json({ error: 'Missing params' });

  const safeFolder = String(folder).replace(/[^0-9]/g, '');
  if (!safeFolder) return res.status(400).json({ error: 'Invalid folder' });
  const safeName = String(filename).replace(/^.*[\\/]/, '');

  const key = variant === 'preview'
    ? `wallpapers/${safeFolder}/preview/${safeName}`
    : variant === 'preview-free'
      ? `wallpapers/${safeFolder}/preview-free/${safeName}`
      : `wallpapers/${safeFolder}/${safeName}`;

  try {
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
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
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

async function handleMeta(req, res) {
  const { folder_number, element, tags, r2_key, preview_key, filename, id, action } = req.body || {};

  if (action === 'set_preview') {
    if (!id || !UUID_RE.test(String(id)) || !preview_key) {
      return res.status(400).json({ error: 'Missing params' });
    }
    const { error: updateError } = await adminSb
      .from('wallpapers')
      .update({ preview_key: String(preview_key) })
      .eq('id', id);
    if (updateError) {
      console.error('wallpaper-meta preview update', updateError);
      return res.status(500).json({ error: 'Database error' });
    }
    return res.status(200).json({ ok: true });
  }

  if (!element || !r2_key || !filename) return res.status(400).json({ error: 'Missing params' });
  if (!VALID_ELEMENTS.has(element)) return res.status(400).json({ error: 'Invalid element' });

  const folderNum = parseInt(folder_number, 10);
  if (!Number.isInteger(folderNum) || folderNum < 1) {
    return res.status(400).json({ error: 'Invalid folder' });
  }

  const blindboxEl = BLINDBOX_FOLDER_ELEMENT[folderNum];
  const pool = blindboxEl ? 'blindbox' : 'match';
  const tagsArr = Array.isArray(tags) ? tags : [];

  if (pool === 'blindbox') {
    if (element !== blindboxEl) return res.status(400).json({ error: 'Invalid element' });
    if (tagsArr.length) return res.status(400).json({ error: 'Blindbox wallpapers cannot have tags' });
  } else if (tagsArr.some((t) => !VALID_TAGS.has(t))) {
    return res.status(400).json({ error: 'Invalid tags' });
  }

  const { error: insertError } = await adminSb.from('wallpapers').insert({
    folder_number: folderNum,
    element,
    tags: tagsArr,
    pool,
    r2_key,
    preview_key: preview_key || null,
    filename,
  });
  if (insertError) {
    console.error('wallpaper-meta insert error:', insertError);
    return res.status(500).json({ error: 'Database error' });
  }
  return res.status(200).json({ ok: true });
}

async function deleteR2Key(key) {
  if (!key) return;
  await s3.send(new DeleteObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
  }));
}

async function handleDelete(req, res) {
  const { id } = req.body || {};
  if (!id) return res.status(400).json({ error: 'Missing id' });
  if (!UUID_RE.test(String(id))) return res.status(400).json({ error: 'Invalid id' });

  try {
    const { data: row, error: fetchErr } = await adminSb
      .from('wallpapers')
      .select('id, r2_key, preview_key')
      .eq('id', id)
      .single();
    if (fetchErr || !row) return res.status(404).json({ error: 'Not found' });

    let previewFreeKey = '';
    if (row.preview_key && String(row.preview_key).includes('/preview/')) {
      previewFreeKey = String(row.preview_key).replace('/preview/', '/preview-free/');
    } else if (row.r2_key) {
      const m = String(row.r2_key).match(/^wallpapers\/(\d+)\/(.+)$/);
      if (m) {
        const base = m[2].replace(/\.[^.]+$/, '') + '.jpg';
        previewFreeKey = `wallpapers/${m[1]}/preview-free/${base}`;
      }
    }

    try { await deleteR2Key(row.r2_key); } catch (e) { console.error('R2 delete original', e); }
    try { await deleteR2Key(row.preview_key); } catch (e) { console.error('R2 delete preview', e); }
    try { await deleteR2Key(previewFreeKey); } catch (e) { console.error('R2 delete preview-free', e); }

    const { error: delErr } = await adminSb.from('wallpapers').delete().eq('id', id);
    if (delErr) {
      console.error('wallpaper-delete DB error:', delErr);
      return res.status(500).json({ error: 'Database error' });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('wallpaper-delete error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const auth = await assertAdmin(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  const fn = fnName(req);
  if (fn === 'presign') return handlePresign(req, res);
  if (fn === 'meta') return handleMeta(req, res);
  if (fn === 'delete') return handleDelete(req, res);
  return res.status(400).json({ error: 'Unknown admin action' });
}
