import { siteUrl } from '../_lib/pricing.js';
import { markOrderPaidAndFulfill } from '../_lib/fulfill-order.js';
import { getServiceSupabase } from '../_lib/supabase.js';
import {
  moneyMatchesOrder,
  orderIdToOutTradeNo,
  outTradeNoToOrderId,
  zpayCallbackParams,
  zpayConfigured,
  zpaySignValid,
} from '../_lib/zpay.js';

function redirect(res, path) {
  const loc = `${siteUrl()}${path}`;
  res.writeHead(302, { Location: loc });
  res.end();
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).end('Method not allowed');
  }

  const params = zpayCallbackParams(req);
  const outTradeNo = String(params.out_trade_no || '');
  const orderId = String(params.param || '') || outTradeNoToOrderId(outTradeNo);
  const cancelPath = orderId
    ? `/landing?checkout=cancel&order=${encodeURIComponent(orderId)}`
    : '/landing?checkout=cancel';

  if (!zpayConfigured() || !zpaySignValid(params) || !orderId) {
    return redirect(res, cancelPath);
  }

  if (String(params.trade_status || '') !== 'TRADE_SUCCESS') {
    return redirect(res, cancelPath);
  }

  try {
    const sb = getServiceSupabase();
    const { data: order } = await sb
      .from('payment_orders')
      .select('*')
      .eq('id', orderId)
      .maybeSingle();
    if (order && order.provider === 'alipay' && moneyMatchesOrder(params.money, order.amount_cents)) {
      await markOrderPaidAndFulfill(order.id, {
        provider: 'alipay',
        providerSessionId: order.provider_session_id || orderIdToOutTradeNo(order.id),
        providerPaymentId: String(params.trade_no || outTradeNo),
        metaExtra: { synced_from: 'zpay_return', trade_status: params.trade_status },
      });
    }
  } catch (err) {
    console.error('zpay return fulfill', err);
  }

  return redirect(res, `/landing?checkout=1&provider=alipay&order=${encodeURIComponent(orderId)}`);
}
