/** Server-side price table (cents). Never trust client amounts. */
export const PRODUCT_PRICES_CENTS = {
  single: 599,
  blindbox: 290,
  annual: 21999,
};

/** Alipay / Z-Pay amounts in 分 (¥39 → 3900). */
export const PRODUCT_PRICES_CNY_CENTS = {
  single: 3900,
  blindbox: 290,
  annual: 143900,
};

const PRODUCT_LABELS = {
  single: 'Mobile Wallpaper',
  mixed:  'Mobile Wallpaper Pack',
  annual: 'Mobile Wallpaper Annual Subscription',
  blindbox: 'Element Mystery Box Original',
  blindbox_draw: 'Element Mystery Box Open',
};

const PRODUCT_LABELS_ZH = {
  single: '手机壁纸原图',
  mixed:  '手机壁纸原图打包',
  annual: '壁纸年度会员',
  blindbox: '五行盲盒原图',
  blindbox_draw: '五行盲盒开启',
};

/** Checkout line-item name shown on Stripe/PayPal. */
export function productLabel(productType, itemCount) {
  if (productType === 'annual') return PRODUCT_LABELS.annual;
  if (productType === 'blindbox_draw') return PRODUCT_LABELS.blindbox_draw;
  if (productType === 'blindbox') return PRODUCT_LABELS.blindbox;
  const n = Number(itemCount);
  if (n === 1) return PRODUCT_LABELS.single;
  if (Number.isInteger(n) && n >= 1) return `Mobile Wallpaper ×${n}`;
  return PRODUCT_LABELS[productType] || PRODUCT_LABELS.mixed;
}

/** Checkout name shown on Alipay / Z-Pay (Chinese, required by the gateway). */
export function productLabelZh(productType, itemCount) {
  if (productType === 'annual') return PRODUCT_LABELS_ZH.annual;
  if (productType === 'blindbox_draw') return PRODUCT_LABELS_ZH.blindbox_draw;
  if (productType === 'blindbox') return PRODUCT_LABELS_ZH.blindbox;
  const n = Number(itemCount);
  if (n === 1) return PRODUCT_LABELS_ZH.single;
  if (Number.isInteger(n) && n >= 1) return `手机壁纸原图×${n}张`;
  return PRODUCT_LABELS_ZH[productType] || PRODUCT_LABELS_ZH.mixed;
}

/** Each wallpaper is priced at single rate. */
export function amountCentsForItemCount(count) {
  const n = Number(count);
  if (!Number.isInteger(n) || n < 1) return null;
  return n * PRODUCT_PRICES_CENTS.single;
}

export function amountCentsForItemCountCny(count) {
  const n = Number(count);
  if (!Number.isInteger(n) || n < 1) return null;
  return n * PRODUCT_PRICES_CNY_CENTS.single;
}

export function productTypeFromItemCount(count) {
  if (count === 1) return 'single';
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

export function siteUrl() {
  return (process.env.PUBLIC_SITE_URL || 'https://www.elementawall.com').replace(/\/$/, '');
}
