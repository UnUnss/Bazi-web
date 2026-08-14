import { getServiceSupabase } from '../_lib/supabase.js';
import { markOrderPaidAndFulfill } from '../_lib/fulfill-order.js';
import {
  moneyMatchesOrder,
  orderIdToOutTradeNo,
  outTradeNoToOrderId,
  zpayCallbackParams,
  zpayConfigured,
  zpaySignValid,
} from '../_lib/zpay.js';

function replySuccess(res) {
  res.status(200).setHeader('Content-Type', 'text/plain; charset=utf-8').end('success');
}

async function fulfillFromZpay(params) {
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
    metaExtra: { synced_from: 'zpay_notify', trade_status: params.trade_status },
  });
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).end('Method not allowed');
  }

  try {
    const params = zpayCallbackParams(req);
    const result = await fulfillFromZpay(params);
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
