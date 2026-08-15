// 限时邀请码：读取自己的码/人数/奖励状态，或绑定别人的码
import { assertUser } from './_lib/auth.js';
import {
  isInviteFeatureOn,
  sanitizeDeviceId,
  getInviteStatus,
  bindInviteCode,
} from './_lib/invite-campaign.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
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
