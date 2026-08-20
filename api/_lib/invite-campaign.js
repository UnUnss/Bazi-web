// 限时邀请码活动。下线时删除本文件、api/invite.js、migration。
// 邀请奖励只能兑换带水印的免费图，不能兑换原图。
import { randomBytes } from 'node:crypto';
import { getServiceSupabase } from './supabase.js';

export const INVITE_CAMPAIGN_ENABLED = true;
/** 北京时间 2026-08-31 23:59:59.999 */
export const INVITE_CAMPAIGN_END_MS = Date.parse('2026-08-31T15:59:59.999Z');

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_RE = /^[A-HJ-NP-Z2-9]{8}$/;
const DEVICE_ID_RE = /^[a-zA-Z0-9_-]{8,64}$/;

export function isInviteBindOpen() {
  return INVITE_CAMPAIGN_ENABLED && Date.now() <= INVITE_CAMPAIGN_END_MS;
}

export function isInviteFeatureOn() {
  return INVITE_CAMPAIGN_ENABLED;
}

export function normalizeInviteCode(raw) {
  return String(raw || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function sanitizeDeviceId(raw) {
  const id = String(raw || '').trim();
  return DEVICE_ID_RE.test(id) ? id : '';
}

function generateInviteCode() {
  const bytes = randomBytes(8);
  let out = '';
  for (let i = 0; i < 8; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

export function publicInviteState(row, extra = {}) {
  return {
    enabled: isInviteFeatureOn(),
    bindOpen: isInviteBindOpen(),
    inviteCode: row?.invite_code || '',
    successCount: Number(row?.success_count || 0),
    rewardStatus: row?.reward_status || 'none',
    ...extra,
  };
}

export async function ensureInviteRow(userId, deviceId) {
  const sb = getServiceSupabase();
  const { data: existing } = await sb
    .from('invite_campaign')
    .select('user_id, invite_code, success_count, reward_status, device_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) {
    if (deviceId && !existing.device_id) {
      const { data: patched } = await sb
        .from('invite_campaign')
        .update({ device_id: deviceId, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .is('device_id', null)
        .select('user_id, invite_code, success_count, reward_status, device_id')
        .maybeSingle();
      return patched || { ...existing, device_id: deviceId };
    }
    return existing;
  }

  for (let i = 0; i < 6; i++) {
    const code = generateInviteCode();
    const { data, error } = await sb
      .from('invite_campaign')
      .insert({
        user_id: userId,
        invite_code: code,
        device_id: deviceId || null,
      })
      .select('user_id, invite_code, success_count, reward_status, device_id')
      .maybeSingle();
    if (!error && data) return data;
    if (error?.code === '23505') {
      const { data: raced } = await sb
        .from('invite_campaign')
        .select('user_id, invite_code, success_count, reward_status, device_id')
        .eq('user_id', userId)
        .maybeSingle();
      if (raced) return raced;
      continue;
    }
    console.error('invite_campaign insert', error);
    throw new Error('Failed to create invite code');
  }
  throw new Error('Failed to create invite code');
}

async function findCountedBind(sb, inviteeId) {
  const { data } = await sb
    .from('invite_redemptions')
    .select('code, inviter_id')
    .eq('invitee_id', inviteeId)
    .eq('status', 'counted')
    .maybeSingle();
  return data || null;
}

export async function getInviteStatus(userId, deviceId) {
  const row = await ensureInviteRow(userId, deviceId);
  const sb = getServiceSupabase();
  const bound = await findCountedBind(sb, userId);
  return publicInviteState(row, { alreadyBound: !!bound });
}

export async function bindInviteCode({ userId, code: rawCode, deviceId }) {
  if (!isInviteBindOpen()) return { ok: false, error: 'ended' };

  const code = normalizeInviteCode(rawCode);
  if (!code) return { ok: false, error: 'empty' };
  if (!CODE_RE.test(code)) return { ok: false, error: 'invalid' };

  const own = await ensureInviteRow(userId, deviceId);
  if (own.invite_code === code) return { ok: false, error: 'own' };

  const sb = getServiceSupabase();
  const already = await findCountedBind(sb, userId);
  if (already) return { ok: false, error: 'bound' };

  const { data: inviter } = await sb
    .from('invite_campaign')
    .select('user_id, invite_code, device_id')
    .eq('invite_code', code)
    .maybeSingle();
  if (!inviter?.user_id) return { ok: false, error: 'invalid' };
  if (inviter.user_id === userId) return { ok: false, error: 'own' };

  const { data: mutual } = await sb
    .from('invite_redemptions')
    .select('id')
    .eq('inviter_id', userId)
    .eq('invitee_id', inviter.user_id)
    .eq('status', 'counted')
    .limit(1);
  if (mutual?.length) return { ok: false, error: 'mutual' };

  const sameDevice = !!(deviceId && inviter.device_id && deviceId === inviter.device_id);
  if (sameDevice) {
    await sb.from('invite_redemptions').insert({
      invitee_id: userId,
      inviter_id: inviter.user_id,
      code,
      status: 'rejected',
      reject_reason: 'device',
      device_id: deviceId || null,
    });
    return { ok: false, error: 'device' };
  }

  const { error: insertErr } = await sb.from('invite_redemptions').insert({
    invitee_id: userId,
    inviter_id: inviter.user_id,
    code,
    status: 'counted',
    device_id: deviceId || null,
  });
  if (insertErr?.code === '23505') return { ok: false, error: 'bound' };
  if (insertErr) {
    console.error('invite_redemptions insert', insertErr);
    return { ok: false, error: 'generic' };
  }

  const { error: addErr } = await sb.rpc('invite_add_success', { p_inviter_id: inviter.user_id });
  if (addErr) {
    console.error('invite_add_success', addErr);
    await sb
      .from('invite_redemptions')
      .delete()
      .eq('invitee_id', userId)
      .eq('inviter_id', inviter.user_id)
      .eq('status', 'counted');
    return { ok: false, error: 'generic' };
  }

  const latest = await getInviteStatus(userId, deviceId);
  return { ok: true, ...latest };
}

export async function consumeInviteReward(userId) {
  if (!isInviteFeatureOn() || !userId) return false;
  const sb = getServiceSupabase();
  const { data } = await sb
    .from('invite_campaign')
    .update({ reward_status: 'used', updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('reward_status', 'granted')
    .select('user_id')
    .maybeSingle();
  return !!data;
}

export async function revertInviteReward(userId) {
  if (!userId) return;
  const sb = getServiceSupabase();
  await sb
    .from('invite_campaign')
    .update({ reward_status: 'granted', updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('reward_status', 'used');
}
