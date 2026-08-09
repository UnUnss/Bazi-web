/**
 * Local sanity check for checkout pricing table (no network / no secrets).
 * Run: node scripts/check-checkout-pricing.mjs
 */
import {
  PRODUCT_PRICES_CENTS,
  productTypeFromItemCount,
  amountForProduct,
  amountCentsForItemCount,
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

const countMap = { 1: 'single', 2: 'pack2', 3: 'mixed', 4: 'pack4', 5: 'mixed' };
for (const [n, typ] of Object.entries(countMap)) {
  const got = productTypeFromItemCount(Number(n));
  if (got !== typ) {
    console.error('FAIL count', n, got);
    failed++;
  } else {
    console.log('OK count', n, '->', typ);
  }
}

// 3 = pack2 + single = 1099 + 599
const cartCases = [
  [1, 599],
  [2, 1099],
  [3, 1099 + 599],
  [4, 1999],
  [5, 1999 + 599],
  [6, 1999 + 1099],
];
for (const [n, cents] of cartCases) {
  const got = amountCentsForItemCount(n);
  if (got !== cents) {
    console.error('FAIL cart', n, got, 'expected', cents);
    failed++;
  } else {
    console.log('OK cart', n, cents);
  }
}

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nAll pricing checks passed');
