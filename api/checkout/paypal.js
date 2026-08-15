import { assertUser } from '../_lib/auth.js';
import { getServiceSupabase } from '../_lib/supabase.js';
import { markOrderPaidAndFulfill } from '../_lib/fulfill-order.js';
import { paypalFetch, verifyPayPalWebhook } from '../_lib/paypal.js';

export const config = {
  api: { bodyParser: false },
};

async function readRawBody(req) {
  if (typeof req.body === 'string') return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');
  if (req.body && typeof req.body === 'object') return JSON.stringify(req.body);
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function parseJsonBody(raw) {
  if (!raw) return {};
  try {
    const data = JSON.parse(raw);
    return data && typeof data === 'object' ? data : {};
  } catch (_) {
    return {};
  }
}

function paypalAction(req) {
  const path = String(req.url || req.headers?.['x-invoke-path'] || '');
  if (path.includes('paypal-webhook')) return 'webhook';
  if (path.includes('paypal-capture')) return 'capture';
  const q = String(req.query?.action || '').toLowerCase();
  if (q === 'capture' || q === 'webhook') return q;
  return '';
}

async function handleCapture(req, res) {
  const auth = await assertUser(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  const rawBody = await readRawBody(req);
  const body = parseJsonBody(rawBody);
  const orderId = body.orderId || body.order;
  if (!orderId) return res.status(400).json({ error: 'Missing orderId' });

  const sb = getServiceSupabase();
  const { data: order, error } = await sb
    .from('payment_orders')
    .select('*')
    .eq('id', orderId)
    .maybeSingle();
  if (error || !order) return res.status(404).json({ error: 'Order not found' });
  if (order.user_id !== auth.userId && order.owner_email !== auth.email) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (order.provider !== 'paypal') {
    return res.status(400).json({ error: 'Not a PayPal order' });
  }

  if (order.status === 'paid') {
    return res.status(200).json({ ok: true, status: 'paid', orderId: order.id, alreadyPaid: true });
  }

  const paypalOrderId = order.provider_session_id;
  if (!paypalOrderId) return res.status(400).json({ error: 'Missing PayPal order id' });

  const { ok, data, status } = await paypalFetch(`/v2/checkout/orders/${paypalOrderId}/capture`, {
    method: 'POST',
    body: {},
  });

  const already = !ok && (data?.name === 'ORDER_ALREADY_CAPTURED'
    || String(data?.message || '').includes('already'));
  if (!ok && !already) {
    console.error('PayPal capture failed', status, data);
    return res.status(502).json({ error: 'PayPal capture failed', detail: data });
  }

  let capturePayload = data;
  if (already) {
    const got = await paypalFetch(`/v2/checkout/orders/${paypalOrderId}`);
    capturePayload = got.data;
  }

  const captureId = capturePayload?.purchase_units?.[0]?.payments?.captures?.[0]?.id
    || capturePayload?.id
    || paypalOrderId;

  const result = await markOrderPaidAndFulfill(order.id, {
    provider: 'paypal',
    providerSessionId: paypalOrderId,
    providerPaymentId: captureId,
    metaExtra: { paypal_capture: capturePayload?.status || 'CAPTURED' },
  });

  if (!result.ok) {
    return res.status(500).json({ error: result.error || 'Fulfill failed' });
  }

  return res.status(200).json({
    ok: true,
    status: 'paid',
    orderId: order.id,
    alreadyPaid: !!result.alreadyPaid,
  });
}

async function handleWebhook(req, res) {
  try {
    const rawBody = await readRawBody(req);
    const verified = await verifyPayPalWebhook(req.headers, rawBody);
    if (!verified.ok) {
      console.error('PayPal webhook verify failed', verified.error, verified.data);
      return res.status(400).json({ error: verified.error || 'verify failed' });
    }

    const event = verified.event;
    const eventType = event?.event_type;

    if (eventType === 'PAYMENT.CAPTURE.COMPLETED' || eventType === 'CHECKOUT.ORDER.COMPLETED') {
      const resource = event.resource || {};
      let orderId = resource.custom_id
        || resource.invoice_id
        || resource.supplementary_data?.related_ids?.order_id;

      const paypalOrderId = resource.supplementary_data?.related_ids?.order_id
        || resource.id;

      const sb = getServiceSupabase();
      if (!orderId && paypalOrderId) {
        const { data: bySession } = await sb
          .from('payment_orders')
          .select('id')
          .eq('provider', 'paypal')
          .eq('provider_session_id', paypalOrderId)
          .maybeSingle();
        orderId = bySession?.id;
      }

      if (!orderId && resource.id) {
        const { data: byPay } = await sb
          .from('payment_orders')
          .select('id')
          .eq('provider_payment_id', resource.id)
          .maybeSingle();
        if (byPay) orderId = byPay.id;
      }

      if (orderId) {
        const result = await markOrderPaidAndFulfill(orderId, {
          provider: 'paypal',
          providerPaymentId: resource.id || null,
          providerSessionId: paypalOrderId || null,
          metaExtra: { paypal_event_type: eventType, paypal_event_id: event.id },
        });
        if (!result.ok) console.error('PayPal webhook fulfill failed', result.error);
      } else {
        console.warn('PayPal webhook: could not resolve order', eventType, resource.id);
      }
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('PayPal webhook error', err);
    return res.status(500).json({ error: 'Webhook handler failed' });
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const action = paypalAction(req);
  if (action === 'capture') return handleCapture(req, res);
  if (action === 'webhook') return handleWebhook(req, res);
  return res.status(404).json({ error: 'Not found' });
}
