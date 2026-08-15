import { assertUser } from './_lib/auth.js';
import {
  isInviteFeatureOn,
  sanitizeDeviceId,
  getInviteStatus,
  bindInviteCode,
} from './_lib/invite-campaign.js';

function handleGeo(req, res) {
  const country = String(req.headers['x-vercel-ip-country'] || '').toUpperCase();
  const host = String(req.headers.host || '');
  const local = host.startsWith('localhost') || host.startsWith('127.0.0.1');
  const mainland = country === 'CN' || (local && !country);

  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ country, mainland });
}

async function handleInvite(req, res) {
  if (!isInviteFeatureOn()) return res.status(404).json({ error: 'ended' });

  const auth = await assertUser(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  const body = req.body || {};
  const action = String(body.action || 'status').trim();
  const deviceId = sanitizeDeviceId(body.device_id);

  try {
    if (action === 'bind') {
      const result = await bindInviteCode({
        userId: auth.userId,
        code: body.code,
        deviceId,
      });
      if (!result.ok) {
        const status = result.error === 'ended' ? 403 : 400;
        return res.status(status).json({ error: result.error });
      }
      return res.status(200).json(result);
    }

    const status = await getInviteStatus(auth.userId, deviceId);
    return res.status(200).json({ ok: true, ...status });
  } catch (err) {
    console.error('invite api', err);
    return res.status(500).json({ error: 'generic' });
  }
}

export default async function handler(req, res) {
  if (req.method === 'GET') return handleGeo(req, res);
  if (req.method === 'POST') return handleInvite(req, res);
  return res.status(405).end();
}
