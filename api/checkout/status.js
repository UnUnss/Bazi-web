import Stripe from 'stripe';
import { assertUser } from '../_lib/auth.js';
import { getServiceSupabase } from '../_lib/supabase.js';
import { markOrderPaidAndFulfill } from '../_lib/fulfill-order.js';
import { paypalFetch } from '../_lib/paypal.js';
import { moneyMatchesOrder, zpayConfigured, zpayQueryOrder } from '../_lib/zpay.js';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await assertUser(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  const orderId = (req.method === 'GET' ? req.query?.orderId || req.query?.order : req.body?.orderId || req.body?.order) || '';
  if (!orderId) return res.status(400).json({ error: 'Missing orderId' });

  const sb = getServiceSupabase();
  const { data: order, error } = await sb
    .from('payment_orders')
    .select('*')
    .eq('id', orderId)
    .maybeSingle();

  if (error) {
    console.error('status fetch error', error);
    return res.status(500).json({ error: 'Database error' });
  }
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.user_id !== auth.userId && order.owner_email !== auth.email) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // Sync from provider if still pending (webhook delay / missed webhook)
  if (order.status === 'pending') {
    try {
      if (order.provider === 'stripe' && order.provider_session_id && process.env.STRIPE_SECRET_KEY) {
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
        const session = await stripe.checkout.sessions.retrieve(order.provider_session_id);
        // 只认已付款。status=complete 只表示 Checkout 结束，延迟支付方式下钱可能还没到。
        if (session.payment_status === 'paid') {
          await markOrderPaidAndFulfill(order.id, {
            provider: 'stripe',
            providerSessionId: session.id,
            providerPaymentId: typeof session.payment_intent === 'string'
              ? session.payment_intent
              : session.payment_intent?.id || null,
            metaExtra: { synced_from: 'status' },
          });
        }
      }
      if (order.provider === 'paypal' && order.provider_session_id) {
        const { ok, data } = await paypalFetch(`/v2/checkout/orders/${order.provider_session_id}`);
        // APPROVED means buyer returned but capture may still be in flight on this request path
        if (ok && (data.status === 'COMPLETED' || data.status === 'APPROVED')) {
          if (data.status === 'APPROVED') {
            const cap = await paypalFetch(`/v2/checkout/orders/${order.provider_session_id}/capture`, {
              method: 'POST',
              body: {},
            });
            const already = !cap.ok && (cap.data?.name === 'ORDER_ALREADY_CAPTURED'
              || String(cap.data?.message || '').includes('already'));
            if (cap.ok || already) {
              const payload = cap.ok ? cap.data : data;
              const captureId = payload?.purchase_units?.[0]?.payments?.captures?.[0]?.id || null;
              await markOrderPaidAndFulfill(order.id, {
                provider: 'paypal',
                providerSessionId: order.provider_session_id,
                providerPaymentId: captureId,
                metaExtra: { synced_from: 'status_capture' },
              });
            }
          } else {
            const captureId = data.purchase_units?.[0]?.payments?.captures?.[0]?.id || null;
            await markOrderPaidAndFulfill(order.id, {
              provider: 'paypal',
              providerSessionId: data.id,
              providerPaymentId: captureId,
              metaExtra: { synced_from: 'status' },
            });
          }
        }
      }
      if (order.provider === 'alipay' && zpayConfigured()) {
        const outTradeNo = order.provider_session_id
          || String(order.id).replace(/-/g, '');
        const { ok, data } = await zpayQueryOrder(outTradeNo);
        if (ok && Number(data.status) === 1) {
          if (data.money != null && data.money !== ''
            && !moneyMatchesOrder(data.money, order.amount_cents)) {
            console.error('zpay status money mismatch', {
              orderId: order.id,
              expected: order.amount_cents,
              got: data.money,
            });
          } else {
            await markOrderPaidAndFulfill(order.id, {
              provider: 'alipay',
              providerSessionId: outTradeNo,
              providerPaymentId: data.trade_no || outTradeNo,
              metaExtra: { synced_from: 'status' },
            });
          }
        }
      }
    } catch (err) {
      console.error('status sync error', err);
    }
  }

  const { data: fresh } = await sb
    .from('payment_orders')
    .select('*')
    .eq('id', orderId)
    .maybeSingle();

  const row = fresh || order;
  const { data: itemRows } = await sb
    .from('payment_order_items')
    .select('r2_key, preview_url, wallpaper_name, wallpaper_id')
    .eq('order_id', orderId);

  return res.status(200).json({
    orderId: row.id,
    status: row.status,
    productType: row.product_type,
    amountCents: row.amount_cents,
    currency: row.currency,
    provider: row.provider,
    annualPlanId: row.annual_plan_id,
    paidAt: row.paid_at,
    items: (itemRows || []).map((it) => ({
      r2Key: it.r2_key,
      previewUrl: it.preview_url,
      name: it.wallpaper_name,
      wallpaperId: it.wallpaper_id,
    })),
    meta: row.meta,
  });
}
