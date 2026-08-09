import { getServiceSupabase } from '../_lib/supabase.js';
import { markOrderPaidAndFulfill } from '../_lib/fulfill-order.js';
import { verifyPayPalWebhook } from '../_lib/paypal.js';

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

export const config = {
  api: { bodyParser: false },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

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
      // custom_id may be on purchase_unit or supplementary_data
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

      // CAPTURE resource: look up via provider_session or custom_id in related
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
