import assert from 'node:assert/strict';
import test from 'node:test';
import { formatCompactCurrencyFromKrwAtRate } from '@/lib/finance/currency';

/**
 * Compact money display for dense financial panels: KRW in 조/억 (Korean desk
 * convention), other currencies via Intl compact. Replaces unreadable 13-digit
 * raw figures (e.g. ₩1,707,974,174,906 → ₩1.71조).
 */

test('KRW renders in 조 above a trillion', () => {
  assert.equal(formatCompactCurrencyFromKrwAtRate(1_710_000_000_000, 'KRW'), '₩1.71조');
  assert.equal(formatCompactCurrencyFromKrwAtRate(3_880_000_000_000, 'KRW'), '₩3.88조');
});

test('KRW renders in 억 between a hundred-million and a trillion', () => {
  assert.equal(formatCompactCurrencyFromKrwAtRate(480_000_000_000, 'KRW'), '₩4800.0억');
  assert.equal(formatCompactCurrencyFromKrwAtRate(150_000_000, 'KRW'), '₩1.5억');
});

test('null / non-finite → N/A', () => {
  assert.equal(formatCompactCurrencyFromKrwAtRate(null, 'KRW'), 'N/A');
  assert.equal(formatCompactCurrencyFromKrwAtRate(undefined, 'KRW'), 'N/A');
});

test('non-KRW uses Intl compact at the given fx rate', () => {
  // 1.35e9 KRW at 1350 KRW/USD = $1,000,000 → "$1M".
  const usd = formatCompactCurrencyFromKrwAtRate(1_350_000_000, 'USD', 1350);
  assert.match(usd, /^\$1(\.\d)?M$/);
});
