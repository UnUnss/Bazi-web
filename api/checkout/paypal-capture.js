import { assertUser } from '../_lib/auth.js';
import { getServiceSupabase } from '../_lib/supabase.js';
import { markOrderPaidAndFulfill } from '../_lib/fulfill-order.js';
import { paypalFetch } from '../_lib/paypal.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await assertUser(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  const orderId = req.body?.orderId || req.body?.order;
  const paypalToken = req.body?.paypalOrderId || req.body?.token; // PayPal returns token=ORDER_ID
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

  const paypalOrderId = order.provider_session_id || paypalToken;
  if (!paypalOrderId) return res.status(400).json({ error: 'Missing PayPal order id' });

  const { ok, data, status } = await paypalFetch(`/v2/checkout/orders/${paypalOrderId}/capture`, {
    method: 'POST',
    body: {},
  });

  // ORDER_ALREADY_CAPTURED → treat as success
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
