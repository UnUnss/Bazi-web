function paypalBase() {
  // Default to Live; override with PAYPAL_API_BASE=https://api-m.sandbox.paypal.com for sandbox.
  return (process.env.PAYPAL_API_BASE || 'https://api-m.paypal.com').replace(/\/$/, '');
}

let _cachedToken = null;
let _tokenExpiresAt = 0;

export async function getPayPalAccessToken() {
  const now = Date.now();
  if (_cachedToken && now < _tokenExpiresAt - 30_000) return _cachedToken;

  const clientId = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !secret) throw new Error('PayPal credentials not configured');

  const auth = Buffer.from(`${clientId}:${secret}`).toString('base64');
  const res = await fetch(`${paypalBase()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    console.error('PayPal token error', data);
    throw new Error('Failed to get PayPal access token');
  }
  _cachedToken = data.access_token;
  _tokenExpiresAt = now + (Number(data.expires_in) || 300) * 1000;
  return _cachedToken;
}

export async function paypalFetch(path, { method = 'GET', body } = {}) {
  const token = await getPayPalAccessToken();
  const res = await fetch(`${paypalBase()}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export async function verifyPayPalWebhook(headers, rawBody) {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) return { ok: false, error: 'PAYPAL_WEBHOOK_ID missing' };

  const transmissionId = headers['paypal-transmission-id'] || headers['Paypal-Transmission-Id'];
  const transmissionTime = headers['paypal-transmission-time'] || headers['Paypal-Transmission-Time'];
  const certUrl = headers['paypal-cert-url'] || headers['Paypal-Cert-Url'];
  const authAlgo = headers['paypal-auth-algo'] || headers['Paypal-Auth-Algo'];
  const transmissionSig = headers['paypal-transmission-sig'] || headers['Paypal-Transmission-Sig'];

  if (!transmissionId || !transmissionTime || !certUrl || !authAlgo || !transmissionSig) {
    return { ok: false, error: 'Missing PayPal webhook headers' };
  }

  let event;
  try {
    event = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
  } catch (_) {
    return { ok: false, error: 'Invalid JSON body' };
  }

  const { ok, data } = await paypalFetch('/v1/notifications/verify-webhook-signature', {
    method: 'POST',
    body: {
      auth_algo: authAlgo,
      cert_url: certUrl,
      transmission_id: transmissionId,
      transmission_sig: transmissionSig,
      transmission_time: transmissionTime,
      webhook_id: webhookId,
      webhook_event: event,
    },
  });

  if (!ok || data.verification_status !== 'SUCCESS') {
    return { ok: false, error: 'Webhook verification failed', data };
  }
  return { ok: true, event };
}
