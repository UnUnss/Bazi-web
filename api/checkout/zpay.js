import { getServiceSupabase } from '../_lib/supabase.js';
import { markOrderPaidAndFulfill } from '../_lib/fulfill-order.js';
import {
  productLabelZh,
  siteUrl,
} from '../_lib/pricing.js';
import {
  ZPAY_SUBMIT_URL,
  buildZpaySubmitParams,
  centsToYuan,
  moneyMatchesOrder,
  orderIdToOutTradeNo,
  outTradeNoToOrderId,
  zpayCallbackParams,
  zpayConfigured,
  zpaySignValid,
} from '../_lib/zpay.js';

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function zpayAction(req) {
  const path = String(req.url || req.headers?.['x-invoke-path'] || '');
  if (path.includes('zpay-notify')) return 'notify';
  if (path.includes('zpay-return')) return 'return';
  if (path.includes('zpay-go')) return 'go';
  if (path.includes('/api/geo')) return 'geo';
  const q = String(req.query?.action || '').toLowerCase();
  if (q === 'go' || q === 'notify' || q === 'return' || q === 'geo') return q;
  return '';
}

function replySuccess(res) {
  res.status(200).setHeader('Content-Type', 'text/plain; charset=utf-8').end('success');
}

function redirect(res, path) {
  const loc = `${siteUrl()}${path}`;
  res.writeHead(302, { Location: loc });
  res.end();
}

async function fulfillFromZpay(params, source) {
  if (!zpayConfigured()) return { ok: false, error: 'not configured' };
  if (!zpaySignValid(params)) return { ok: false, error: 'bad sign' };
  if (String(params.trade_status || '') !== 'TRADE_SUCCESS') {
    return { ok: false, error: 'not success' };
  }

  const outTradeNo = String(params.out_trade_no || '');
  const orderId = String(params.param || '') || outTradeNoToOrderId(outTradeNo);
  if (!orderId) return { ok: false, error: 'missing order' };

  const sb = getServiceSupabase();
  const { data: order } = await sb
    .from('payment_orders')
    .select('*')
    .eq('id', orderId)
    .maybeSingle();
  if (!order) return { ok: false, error: 'order not found' };
  if (order.provider !== 'alipay') return { ok: false, error: 'not alipay' };
  if (order.status === 'paid') return { ok: true, alreadyPaid: true };
  if (!moneyMatchesOrder(params.money, order.amount_cents)) {
    console.error('zpay money mismatch', {
      orderId,
      expected: order.amount_cents,
      got: params.money,
    });
    return { ok: false, error: 'money mismatch' };
  }

  return markOrderPaidAndFulfill(order.id, {
    provider: 'alipay',
    providerSessionId: order.provider_session_id || orderIdToOutTradeNo(order.id),
    providerPaymentId: String(params.trade_no || outTradeNo),
    metaExtra: { synced_from: source, trade_status: params.trade_status },
  });
}

async function handleGo(req, res) {
  if (req.method !== 'GET') return res.status(405).end('Method not allowed');
  if (!zpayConfigured()) return res.status(500).end('Alipay not configured');

  const orderId = String(req.query?.order || '').trim();
  if (!orderId) return res.status(400).end('Missing order');

  const sb = getServiceSupabase();
  const { data: order, error } = await sb
    .from('payment_orders')
    .select('*')
    .eq('id', orderId)
    .maybeSingle();

  if (error || !order) return res.status(404).end('Order not found');
  if (order.provider !== 'alipay') return res.status(400).end('Not an Alipay order');
  if (order.status !== 'pending') return res.status(400).end('Order is not payable');

  const { count } = await sb
    .from('payment_order_items')
    .select('id', { count: 'exact', head: true })
    .eq('order_id', order.id);

  const name = (order.meta && order.meta.zpay_name)
    || productLabelZh(order.product_type, count || 0);
  const base = siteUrl();
  const params = buildZpaySubmitParams({
    name,
    moneyYuan: centsToYuan(order.amount_cents),
    outTradeNo: order.provider_session_id || orderIdToOutTradeNo(order.id),
    notifyUrl: `${base}/api/checkout/zpay-notify`,
    returnUrl: `${base}/api/checkout/zpay-return`,
    param: order.id,
  });

  const fields = Object.entries(params).map(([k, v]) => (
    `<input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(v)}">`
  )).join('');

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).end(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>正在跳转支付宝</title>
</head>
<body>
  <p>正在跳转支付宝支付（¥${escapeHtml(centsToYuan(order.amount_cents))}）…</p>
  <form id="zpay" method="POST" action="${ZPAY_SUBMIT_URL}">${fields}</form>
  <script>document.getElementById('zpay').submit();</script>
</body>
</html>`);
}

async function handleNotify(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).end('Method not allowed');
  }

  try {
    const params = zpayCallbackParams(req);
    const result = await fulfillFromZpay(params, 'zpay_notify');
    if (!result.ok) {
      console.error('zpay notify', result.error);
      return res.status(400).end(result.error || 'fail');
    }
    return replySuccess(res);
  } catch (err) {
    console.error('zpay notify error', err);
    return res.status(500).end('error');
  }
}

async function handleReturn(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).end('Method not allowed');
  }

  const params = zpayCallbackParams(req);
  const outTradeNo = String(params.out_trade_no || '');
  const orderId = String(params.param || '') || outTradeNoToOrderId(outTradeNo);
  const successPath = orderId
    ? `/landing?checkout=1&provider=alipay&order=${encodeURIComponent(orderId)}`
    : '/landing';
  const cancelPath = orderId
    ? `/landing?checkout=cancel&order=${encodeURIComponent(orderId)}`
    : '/landing?checkout=cancel';

  const signOk = zpayConfigured() && zpaySignValid(params);
  const paid = String(params.trade_status || '') === 'TRADE_SUCCESS';

  if (signOk && paid) {
    try {
      await fulfillFromZpay(params, 'zpay_return');
    } catch (err) {
      console.error('zpay return fulfill', err);
    }
    return redirect(res, successPath);
  }

  if (signOk && !paid) {
    return redirect(res, cancelPath);
  }

  // Rewrite used to inject ?action= into the callback query and break MD5.
  // If we still have an order id, let the page poll Z-Pay instead of showing cancel.
  if (orderId) {
    console.error('zpay return unverified, polling via status', { orderId });
    return redirect(res, successPath);
  }
  return redirect(res, cancelPath);
}

function handleGeo(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const country = String(req.headers['x-vercel-ip-country'] || '').toUpperCase();
  const host = String(req.headers.host || '');
  const local = host.startsWith('localhost') || host.startsWith('127.0.0.1');
  const mainland = country === 'CN' || (local && !country);

  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ country, mainland });
}

export default async function handler(req, res) {
  const action = zpayAction(req);
  if (action === 'geo') return handleGeo(req, res);
  if (action === 'go') return handleGo(req, res);
  if (action === 'notify') return handleNotify(req, res);
  if (action === 'return') return handleReturn(req, res);
  return res.status(404).end('Not found');
}
