import { getServiceSupabase } from './supabase.js';

function addOneYearYMD(startYmd) {
  const [y, m, d] = String(startYmd).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCFullYear(dt.getUTCFullYear() + 1);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function todayYMD() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Mark order paid + fulfill (idempotent).
 * @returns {{ ok: boolean, order?: object, error?: string, alreadyPaid?: boolean }}
 */
export async function markOrderPaidAndFulfill(orderId, {
  provider,
  providerPaymentId,
  providerSessionId,
  metaExtra,
} = {}) {
  if (!orderId) return { ok: false, error: 'Missing orderId' };
  const sb = getServiceSupabase();

  const { data: order, error: fetchErr } = await sb
    .from('payment_orders')
    .select('*')
    .eq('id', orderId)
    .maybeSingle();
  if (fetchErr) {
    console.error('fulfill fetch error', fetchErr);
    return { ok: false, error: 'Database error' };
  }
  if (!order) return { ok: false, error: 'Order not found' };

  if (order.status === 'paid') {
    return { ok: true, order, alreadyPaid: true };
  }
  if (order.status !== 'pending' && order.status !== 'failed') {
    return { ok: false, error: `Order not payable: ${order.status}` };
  }

  let annualPlanId = order.annual_plan_id || null;
  const nextMeta = {
    ...(order.meta && typeof order.meta === 'object' ? order.meta : {}),
    ...(metaExtra && typeof metaExtra === 'object' ? metaExtra : {}),
  };

  if (order.product_type === 'annual' && !annualPlanId) {
    const start = todayYMD();
    const end = addOneYearYMD(start);
    annualPlanId = `ap_${order.id.replace(/-/g, '').slice(0, 16)}`;
    const { error: planErr } = await sb.from('annual_plans').upsert({
      id: annualPlanId,
      owner_email: order.owner_email,
      user_id: order.user_id,
      start_date: start,
      end_date: end,
      profile_ids: [],
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
    if (planErr) {
      console.error('fulfill annual_plans error', planErr);
      return { ok: false, error: 'Failed to create annual plan' };
    }
    nextMeta.annual_plan = { id: annualPlanId, start, end };
  }

  const patch = {
    status: 'paid',
    paid_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    meta: nextMeta,
  };
  if (provider) patch.provider = provider;
  if (providerPaymentId) patch.provider_payment_id = providerPaymentId;
  if (providerSessionId) patch.provider_session_id = providerSessionId;
  if (annualPlanId) patch.annual_plan_id = annualPlanId;

  const { data: updated, error: updErr } = await sb
    .from('payment_orders')
    .update(patch)
    .eq('id', orderId)
    .eq('status', order.status) // optimistic lock-ish
    .select('*')
    .maybeSingle();

  if (updErr) {
    console.error('fulfill update error', updErr);
    // Unique provider_payment_id race: re-read
    const { data: again } = await sb.from('payment_orders').select('*').eq('id', orderId).maybeSingle();
    if (again?.status === 'paid') return { ok: true, order: again, alreadyPaid: true };
    return { ok: false, error: 'Failed to update order' };
  }

  if (!updated) {
    const { data: again } = await sb.from('payment_orders').select('*').eq('id', orderId).maybeSingle();
    if (again?.status === 'paid') return { ok: true, order: again, alreadyPaid: true };
    return { ok: false, error: 'Order update conflict' };
  }

  return { ok: true, order: updated, alreadyPaid: false };
}

/** Whether user may download this r2_key (paid order item or active annual). */
export async function userCanDownloadKey({ userId, email, r2Key }) {
  const sb = getServiceSupabase();
  const emailNorm = String(email || '').trim().toLowerCase();

  // Active annual plan
  const today = todayYMD();
  if (userId) {
    const { data: byUser } = await sb
      .from('annual_plans')
      .select('id')
      .eq('user_id', userId)
      .lte('start_date', today)
      .gte('end_date', today)
      .limit(1);
    if (byUser?.length) return true;
  }
  if (emailNorm) {
    const { data: byEmail } = await sb
      .from('annual_plans')
      .select('id')
      .eq('owner_email', emailNorm)
      .lte('start_date', today)
      .gte('end_date', today)
      .limit(1);
    if (byEmail?.length) return true;
  }

  // Paid order containing this r2_key
  const { data: items } = await sb
    .from('payment_order_items')
    .select('order_id')
    .eq('r2_key', r2Key);
  if (!items?.length) return false;

  const orderIds = [...new Set(items.map((i) => i.order_id).filter(Boolean))];
  if (!orderIds.length) return false;

  if (userId) {
    const { data: paidUser } = await sb
      .from('payment_orders')
      .select('id')
      .in('id', orderIds)
      .eq('status', 'paid')
      .eq('user_id', userId)
      .limit(1);
    if (paidUser?.length) return true;
  }
  if (emailNorm) {
    const { data: paidEmail } = await sb
      .from('payment_orders')
      .select('id')
      .in('id', orderIds)
      .eq('status', 'paid')
      .eq('owner_email', emailNorm)
      .limit(1);
    if (paidEmail?.length) return true;
  }
  return false;
}
