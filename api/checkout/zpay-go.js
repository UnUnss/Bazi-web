import { getServiceSupabase } from '../_lib/supabase.js';
import {
  productLabelZh,
  siteUrl,
} from '../_lib/pricing.js';
import {
  ZPAY_SUBMIT_URL,
  buildZpaySubmitParams,
  centsToYuan,
  orderIdToOutTradeNo,
  zpayConfigured,
} from '../_lib/zpay.js';

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export default async function handler(req, res) {
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
