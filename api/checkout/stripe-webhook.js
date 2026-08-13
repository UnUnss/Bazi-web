import Stripe from 'stripe';
import { markOrderPaidAndFulfill } from '../_lib/fulfill-order.js';

async function fulfillCheckout(event) {
  if (event.type !== 'checkout.session.completed') return;
  const session = event.data.object;
  const orderId = session.metadata?.order_id || session.client_reference_id;
  if (!orderId) return;
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

export async function POST(request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!secret || !key) {
    return Response.json({ error: 'Stripe webhook not configured' }, { status: 500 });
  }

  const rawBody = await request.text();
  const sig = request.headers.get('stripe-signature');

  const stripe = new Stripe(key);
  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch (err) {
    console.error('stripe webhook signature error', err.message, {
      hasSig: Boolean(sig),
      bodyBytes: Buffer.byteLength(rawBody || ''),
    });
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  try {
    await fulfillCheckout(event);
    return Response.json({ received: true });
  } catch (err) {
    console.error('stripe webhook handler error', err);
    return Response.json({ error: 'Webhook handler failed' }, { status: 500 });
  }
}
