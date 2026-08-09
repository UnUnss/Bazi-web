/**
 * Local sanity check for checkout pricing table (no network / no secrets).
 * Run: node scripts/check-checkout-pricing.mjs
 */
import {
  PRODUCT_PRICES_CENTS,
  productTypeFromItemCount,
  amountForProduct,
} from '../api/_lib/pricing.js';

const expected = {
  single: 599,
  pack2: 1099,
  pack4: 1999,
  annual: 21999,
};

let failed = 0;
for (const [k, v] of Object.entries(expected)) {
  const got = amountForProduct(k);
  if (got !== v || PRODUCT_PRICES_CENTS[k] !== v) {
    console.error('FAIL price', k, got);
    failed++;
  } else {
    console.log('OK', k, v);
  }
}

const countMap = { 1: 'single', 2: 'pack2', 4: 'pack4', 3: null };
for (const [n, typ] of Object.entries(countMap)) {
  const got = productTypeFromItemCount(Number(n));
  if (got !== typ) {
    console.error('FAIL count', n, got);
    failed++;
  } else {
    console.log('OK count', n, '->', typ);
  }
}

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nAll pricing checks passed');
