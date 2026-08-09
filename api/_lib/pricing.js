/** Server-side price table (cents). Never trust client amounts. */
export const PRODUCT_PRICES_CENTS = {
  single: 599,
  pack2: 1099,
  pack4: 1999,
  annual: 21999,
};

export const PRODUCT_LABELS = {
  single: 'ElementaWall Wallpaper (1)',
  pack2: 'ElementaWall Wallpaper Pack (2)',
  pack4: 'ElementaWall Wallpaper Pack (4)',
  mixed: 'ElementaWall Wallpaper Pack',
  annual: 'ElementaWall Annual Plan',
};

/** Optimal cart total: packs of 4 → 2 → singles. */
export function amountCentsForItemCount(count) {
  const n0 = Number(count);
  if (!Number.isInteger(n0) || n0 < 1) return null;
  let n = n0;
  let total = 0;
  total += Math.floor(n / 4) * PRODUCT_PRICES_CENTS.pack4;
  n %= 4;
  total += Math.floor(n / 2) * PRODUCT_PRICES_CENTS.pack2;
  n %= 2;
  total += n * PRODUCT_PRICES_CENTS.single;
  return total;
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

export function siteUrl() {
  return (process.env.PUBLIC_SITE_URL || 'https://www.elementawall.com').replace(/\/$/, '');
}
