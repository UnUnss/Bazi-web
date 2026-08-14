/** Server-side price table (cents). Never trust client amounts. */
export const PRODUCT_PRICES_CENTS = {
  single: 599,
  pack2: 1099,
  pack4: 1999,
  annual: 21999,
};

/** Alipay / Z-Pay amounts in 分 (¥39 → 3900). */
export const PRODUCT_PRICES_CNY_CENTS = {
  single: 3900,
  pack2: 6900,
  pack4: 13900,
  annual: 143900,
};

export const PRODUCT_LABELS_ZH = {
  single: '手机壁纸原图1张',
  pack2: '手机壁纸原图2张',
  pack3: '手机壁纸原图3张',
  pack4: '手机壁纸原图4张',
  mixed: '手机壁纸原图打包',
  annual: '壁纸包年服务',
};

export const PRODUCT_LABELS = {
  single: 'Mobile Wallpaper 1 Pack',
  pack2: 'Mobile Wallpaper 2 Pack',
  pack3: 'Mobile Wallpaper 3 Pack',
  pack4: 'Mobile Wallpaper 4 Pack',
  mixed: 'Mobile Wallpaper Pack',
  annual: 'Mobile Wallpaper Annual Subscription',
};

/** Checkout line-item name shown on Stripe/PayPal. */
export function productLabel(productType, itemCount) {
  if (productType === 'annual') return PRODUCT_LABELS.annual;
  const n = Number(itemCount);
  if (n === 1) return PRODUCT_LABELS.single;
  if (n === 2) return PRODUCT_LABELS.pack2;
  if (n === 3) return PRODUCT_LABELS.pack3;
  if (n === 4) return PRODUCT_LABELS.pack4;
  if (Number.isInteger(n) && n >= 1) return `Mobile Wallpaper ${n} Pack`;
  return PRODUCT_LABELS[productType] || 'Mobile Wallpaper Pack';
}

function packTotalCents(count, table) {
  const n0 = Number(count);
  if (!Number.isInteger(n0) || n0 < 1) return null;
  let n = n0;
  let total = 0;
  total += Math.floor(n / 4) * table.pack4;
  n %= 4;
  total += Math.floor(n / 2) * table.pack2;
  n %= 2;
  total += n * table.single;
  return total;
}

/** Optimal cart total: packs of 4 → 2 → singles. */
export function amountCentsForItemCount(count) {
  return packTotalCents(count, PRODUCT_PRICES_CENTS);
}

export function amountCentsForItemCountCny(count) {
  return packTotalCents(count, PRODUCT_PRICES_CNY_CENTS);
}

export function productTypeFromItemCount(count) {
  if (count === 1) return 'single';
  if (count === 2) return 'pack2';
  if (count === 4) return 'pack4';
  if (Number.isInteger(count) && count >= 1) return 'mixed';
  return null;
}

export function amountForProduct(productType) {
  const cents = PRODUCT_PRICES_CENTS[productType];
  if (cents == null) return null;
  return cents;
}

export function amountForProductCny(productType) {
  const cents = PRODUCT_PRICES_CNY_CENTS[productType];
  if (cents == null) return null;
  return cents;
}

/** Checkout name shown on Alipay / Z-Pay (Chinese, required by the gateway). */
export function productLabelZh(productType, itemCount) {
  if (productType === 'annual') return PRODUCT_LABELS_ZH.annual;
  const n = Number(itemCount);
  if (n === 1) return PRODUCT_LABELS_ZH.single;
  if (n === 2) return PRODUCT_LABELS_ZH.pack2;
  if (n === 3) return PRODUCT_LABELS_ZH.pack3;
  if (n === 4) return PRODUCT_LABELS_ZH.pack4;
  if (Number.isInteger(n) && n >= 1) return `手机壁纸原图${n}张`;
  return PRODUCT_LABELS_ZH[productType] || PRODUCT_LABELS_ZH.mixed;
}

export function siteUrl() {
  return (process.env.PUBLIC_SITE_URL || 'https://www.elementawall.com').replace(/\/$/, '');
}
