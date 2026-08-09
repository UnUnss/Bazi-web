import Stripe from 'stripe';
import { markOrderPaidAndFulfill } from '../_lib/fulfill-order.js';

async function readRawBody(req) {
  if (req.rawBody) return Buffer.isBuffer(req.rawBody) ? req.rawBody : Buffer.from(req.rawBody);
  if (typeof req.body === 'string') return Buffer.from(req.body);
  if (Buffer.isBuffer(req.body)) return req.body;
  // Vercel may expose already-parsed JSON; reconstruct (best-effort)
  if (req.body && typeof req.body === 'object') {
    return Buffer.from(JSON.stringify(req.body));
  }
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export const config = {
  api: { bodyParser: false },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!secret || !key) return res.status(500).json({ error: 'Stripe webhook not configured' });

  const stripe = new Stripe(key);
  let event;
  try {
    const rawBody = await readRawBody(req);
    const sig = req.headers['stripe-signature'];
    event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch (err) {
    console.error('stripe webhook signature error', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const orderId = session.metadata?.order_id || session.client_reference_id;
      if (orderId) {
        const result = await markOrderPaidAndFulfill(orderId, {
          provider: 'stripe',
          providerSessionId: session.id,
          providerPaymentId: typeof session.payment_intent === 'string'
            ? session.payment_intent
            : session.payment_intent?.id || null,
          metaExtra: { stripe_event_id: event.id },
        });
        if (!result.ok) console.error('stripe fulfill failed', result.error);
      }
    }
    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('stripe webhook handler error', err);
    return res.status(500).json({ error: 'Webhook handler failed' });
  }
}
