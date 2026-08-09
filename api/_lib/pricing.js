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
  annual: 'ElementaWall Annual Plan',
};

export function productTypeFromItemCount(count) {
  if (count === 1) return 'single';
  if (count === 2) return 'pack2';
  if (count === 4) return 'pack4';
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
