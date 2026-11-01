import Stripe from 'stripe';
import { assertUser } from '../_lib/auth.js';
import { getServiceSupabase } from '../_lib/supabase.js';
import {
  productLabel,
  productLabelZh,
  amountCentsForItemCount,
  amountCentsForItemCountCny,
  amountForProduct,
  amountForProductCny,
  productTypeFromItemCount,
  siteUrl,
} from '../_lib/pricing.js';
import { paypalFetch } from '../_lib/paypal.js';
import { orderIdToOutTradeNo, zpayConfigured } from '../_lib/zpay.js';
import { userCanDownloadKey } from '../_lib/fulfill-order.js';
import {
  getOrCreateMonth,
  hasActiveAnnual,
  resolveDisplayedMonthGanZhi,
} from '../_lib/blindbox.js';

function normalizeItems(rawItems) {
  if (!Array.isArray(rawItems)) return [];
  return rawItems
    .map((it) => ({
      wallpaper_id: it.wallpaper_id || it.wallpaperId || null,
      r2_key: String(it.r2_key || it.r2key || '').trim(),
      preview_url: it.preview_url || it.previewUrl || it.img || null,
      wallpaper_name: it.wallpaper_name || it.name || null,
    }))
    .filter((it) => it.r2_key);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await assertUser(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  const body = req.body || {};
  const provider = String(body.provider || '').toLowerCase();
  if (provider !== 'stripe' && provider !== 'paypal' && provider !== 'alipay') {
    return res.status(400).json({ error: 'provider must be stripe, paypal or alipay' });
  }

  let productType = body.product_type || body.productType || null;
  const items = normalizeItems(body.items);
  const useCny = provider === 'alipay';
  const sb = getServiceSupabase();

  let amountCents;
  let orderMeta = { source: 'checkout/create' };

  if (productType === 'annual') {
    amountCents = useCny ? amountForProductCny('annual') : amountForProduct('annual');
  } else if (productType === 'blindbox_draw') {
    return res.status(400).json({ error: 'Mystery box draws are free' });
  } else if (productType === 'blindbox') {
    if (items.length !== 1) return res.status(400).json({ error: 'One wallpaper required' });
    const annual = await hasActiveAnnual(sb, { userId: auth.userId, email: auth.email });
    if (annual) return res.status(400).json({ error: 'Annual plan already covers mystery box originals' });
    const { data: wall } = await sb
      .from('wallpapers')
      .select('id, r2_key, pool, folder_number')
      .eq('r2_key', items[0].r2_key)
      .maybeSingle();
    const folder = Number(wall?.folder_number);
    const isBlind = wall?.pool === 'blindbox' || (folder >= 141 && folder <= 145);
    if (!isBlind) return res.status(400).json({ error: 'Not a mystery box wallpaper' });
    const alreadyOwned = await userCanDownloadKey({
      userId: auth.userId,
      email: auth.email,
      r2Key: items[0].r2_key,
      wallpaperPool: 'blindbox',
    });
    if (alreadyOwned) return res.status(400).json({ error: 'Already owned' });
    const month = resolveDisplayedMonthGanZhi(body.month_ganzhi);
    const row = month ? await getOrCreateMonth(sb, auth.userId, month) : null;
    const currentIds = (row?.current_ids || []).map(String);
    if (wall?.id && currentIds.length && currentIds.indexOf(String(wall.id)) < 0) {
      return res.status(400).json({ error: 'Wallpaper is not in the current draw' });
    }
    amountCents = useCny ? amountForProductCny('blindbox') : amountForProduct('blindbox');
    productType = 'blindbox';
    orderMeta.kind = 'blindbox_hd';
    orderMeta.month_ganzhi = month;
    orderMeta.credit_count = 0;
  } else {
    // Wallpaper: price by item count, $5.99 / ¥39 each. Ignore client product_type.
    if (!items.length) {
      return res.status(400).json({ error: 'Cart is empty' });
    }
    productType = productTypeFromItemCount(items.length);
    amountCents = useCny
      ? amountCentsForItemCountCny(items.length)
      : amountCentsForItemCount(items.length);
  }

  if (!productType || amountCents == null) {
    return res.status(400).json({ error: 'Unknown product' });
  }

  const unitPrice = productType === 'annual'
    ? amountCents
    : Math.round(amountCents / Math.max(items.length, 1));

  const { data: order, error: orderErr } = await sb
    .from('payment_orders')
    .insert({
      user_id: auth.userId,
      owner_email: auth.email,
      product_type: productType,
      status: 'pending',
      amount_cents: amountCents,
      currency: useCny ? 'CNY' : 'USD',
      provider,
      meta: orderMeta,
    })
    .select('*')
    .single();

  if (orderErr || !order) {
    console.error('create order error', orderErr);
    return res.status(500).json({ error: 'Failed to create order' });
  }

  if (items.length) {
    const rows = items.map((it) => ({
      order_id: order.id,
      wallpaper_id: it.wallpaper_id,
      r2_key: it.r2_key,
      preview_url: it.preview_url,
      wallpaper_name: it.wallpaper_name,
      unit_price_cents: unitPrice,
    }));
    const { error: itemsErr } = await sb.from('payment_order_items').insert(rows);
    if (itemsErr) {
      console.error('create order items error', itemsErr);
      await sb.from('payment_orders').update({ status: 'cancelled' }).eq('id', order.id);
      return res.status(500).json({ error: 'Failed to create order items' });
    }
  }

  const base = siteUrl();
  const successUrl = `${base}/landing?checkout=1&provider=${provider}&order=${order.id}&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${base}/landing?checkout=cancel&order=${order.id}`;
  // PayPal success without Stripe placeholder
  const paypalReturn = `${base}/landing?checkout=1&provider=paypal&order=${order.id}`;
  const paypalCancel = `${base}/landing?checkout=cancel&order=${order.id}`;

  try {
    if (provider === 'stripe') {
      if (!process.env.STRIPE_SECRET_KEY) {
        return res.status(500).json({ error: 'Stripe not configured' });
      }
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        client_reference_id: order.id,
        customer_email: auth.email,
        metadata: { order_id: order.id, product_type: productType },
        line_items: [{
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: amountCents,
            product_data: {
              name: productLabel(productType, items.length),
            },
          },
        }],
        success_url: successUrl,
        cancel_url: cancelUrl,
      });

      await sb.from('payment_orders').update({
        provider_session_id: session.id,
        updated_at: new Date().toISOString(),
      }).eq('id', order.id);

      return res.status(200).json({
        orderId: order.id,
        checkoutUrl: session.url,
        provider: 'stripe',
        sessionId: session.id,
      });
    }

    if (provider === 'paypal') {
    // PayPal
    const amountValue = (amountCents / 100).toFixed(2);
    const { ok, data, status } = await paypalFetch('/v2/checkout/orders', {
      method: 'POST',
      body: {
        intent: 'CAPTURE',
        purchase_units: [{
          custom_id: order.id,
          invoice_id: order.id,
          amount: {
            currency_code: 'USD',
            value: amountValue,
          },
          description: productLabel(productType, items.length),
        }],
        application_context: {
          brand_name: 'ElementaWall',
          landing_page: 'NO_PREFERENCE',
          user_action: 'PAY_NOW',
          return_url: paypalReturn,
          cancel_url: paypalCancel,
        },
      },
    });

    if (!ok || !data?.id) {
      console.error('PayPal create order failed', status, data);
      await sb.from('payment_orders').update({ status: 'failed' }).eq('id', order.id);
      return res.status(502).json({ error: 'PayPal create failed', detail: data });
    }

    const approve = (data.links || []).find((l) => l.rel === 'approve');
    if (!approve?.href) {
      console.error('PayPal order missing approve link', data);
      await sb.from('payment_orders').update({ status: 'failed' }).eq('id', order.id);
      return res.status(502).json({ error: 'PayPal did not return a checkout URL' });
    }

    await sb.from('payment_orders').update({
      provider_session_id: data.id,
      updated_at: new Date().toISOString(),
    }).eq('id', order.id);

    return res.status(200).json({
      orderId: order.id,
      checkoutUrl: approve.href,
      provider: 'paypal',
      paypalOrderId: data.id,
    });
    }

    if (provider === 'alipay') {
    // Alipay via Z-Pay. return/notify URLs cannot carry query strings, so
    // the browser first hits /api/checkout/zpay-go which POSTs to Z-Pay.
    if (!zpayConfigured()) {
      await sb.from('payment_orders').update({ status: 'failed' }).eq('id', order.id);
      return res.status(500).json({ error: 'Alipay not configured' });
    }
    const outTradeNo = orderIdToOutTradeNo(order.id);
    await sb.from('payment_orders').update({
      provider_session_id: outTradeNo,
      meta: {
        ...(order.meta && typeof order.meta === 'object' ? order.meta : {}),
        zpay_name: productLabelZh(productType, items.length),
      },
      updated_at: new Date().toISOString(),
    }).eq('id', order.id);

    return res.status(200).json({
      orderId: order.id,
      checkoutUrl: `${base}/api/checkout/zpay-go?order=${encodeURIComponent(order.id)}`,
      provider: 'alipay',
    });
    }

    return res.status(400).json({ error: 'Unknown provider' });
  } catch (err) {
    console.error('checkout create error', err);
    await sb.from('payment_orders').update({ status: 'failed' }).eq('id', order.id);
    return res.status(500).json({ error: err.message || 'Checkout create failed' });
  }
}
