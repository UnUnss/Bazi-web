import { createHash, timingSafeEqual } from 'crypto';

export const ZPAY_SUBMIT_URL = 'https://zpayz.cn/submit.php';
export const ZPAY_API_URL = 'https://zpayz.cn/api.php';

export function zpayPid() {
  return String(process.env.ZPAY_PID || '').trim();
}

export function zpayKey() {
  return String(process.env.ZPAY_KEY || '').trim();
}

export function zpayCid() {
  return String(process.env.ZPAY_CID || '').trim();
}

export function zpayConfigured() {
  return Boolean(zpayPid() && zpayKey());
}

/** UUID → 32-char out_trade_no (Z-Pay max length). */
export function orderIdToOutTradeNo(orderId) {
  return String(orderId || '').replace(/-/g, '').slice(0, 32);
}

export function outTradeNoToOrderId(outTradeNo) {
  const h = String(outTradeNo || '').replace(/-/g, '').toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(h)) return '';
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

export function centsToYuan(cents) {
  return (Number(cents) / 100).toFixed(2);
}

export function yuanToCents(yuan) {
  const n = Number(yuan);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

export function moneyMatchesOrder(yuan, amountCents) {
  const got = yuanToCents(yuan);
  return got != null && got === Number(amountCents);
}

/** Routing-only query keys from Vercel rewrites; never part of Z-Pay's MD5. */
const ZPAY_INTERNAL_KEYS = new Set(['action', 'sign', 'sign_type']);

/** MD5(sign): ASCII-sort keys, skip sign / sign_type / empty, then key. Lowercase. */
export function zpaySign(params, key = zpayKey()) {
  const keys = Object.keys(params || {})
    .filter((k) => {
      if (ZPAY_INTERNAL_KEYS.has(k)) return false;
      const v = params[k];
      return v !== undefined && v !== null && String(v) !== '';
    })
    .sort();
  const raw = keys.map((k) => `${k}=${params[k]}`).join('&') + key;
  return createHash('md5').update(raw, 'utf8').digest('hex');
}

export function zpaySignValid(params, key = zpayKey()) {
  const expected = zpaySign(params, key);
  const got = String(params?.sign || '').toLowerCase();
  const a = Buffer.from(expected);
  const b = Buffer.from(got);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function buildZpaySubmitParams({
  name,
  moneyYuan,
  outTradeNo,
  notifyUrl,
  returnUrl,
  param,
}) {
  const params = {
    name,
    money: String(moneyYuan),
    type: 'alipay',
    out_trade_no: String(outTradeNo),
    notify_url: notifyUrl,
    pid: zpayPid(),
    param: param || '',
    return_url: returnUrl,
  };
  const cid = zpayCid();
  if (cid) params.cid = cid;
  params.sign = zpaySign(params);
  params.sign_type = 'MD5';
  return params;
}

export async function zpayQueryOrder(outTradeNo) {
  const pid = zpayPid();
  const key = zpayKey();
  if (!pid || !key || !outTradeNo) return { ok: false, data: {} };
  const url = `${ZPAY_API_URL}?act=order&pid=${encodeURIComponent(pid)}`
    + `&key=${encodeURIComponent(key)}`
    + `&out_trade_no=${encodeURIComponent(outTradeNo)}`;
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok && Number(data?.code) === 1, data };
}

export function zpayCallbackParams(req) {
  const q = req.query && typeof req.query === 'object' ? req.query : {};
  const b = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const merged = { ...q, ...b };
  const out = {};
  for (const [k, raw] of Object.entries(merged)) {
    if (k === 'action') continue;
    const v = Array.isArray(raw) ? raw[0] : raw;
    if (v === undefined || v === null) continue;
    out[k] = String(v);
  }
  return out;
}
