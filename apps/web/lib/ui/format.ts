import { formatKrwCompact } from '@/lib/finance/currency';
import { formatNumber } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Shared compact-KRW price formatters for admin/research pages.
//
// These wrap the single-source-of-truth `formatKrwCompact` tier engine in
// `lib/finance/currency.ts` while preserving the EXACT prior output of the
// per-page `formatPriceKrw` copies they replace:
//   - <1조  →  "1.50조"  (2 dp)
//   - <1억  →  "12억"    (0 dp)
//   - else  →  formatNumber(value, 0)
// `null` renders as the em-dash "—" the callers used.
// ---------------------------------------------------------------------------

const PRICE_KRW_TIERS = [
  { min: 1_000_000_000_000, divisor: 1_000_000_000_000, dp: 2, suffix: '조' },
  { min: 100_000_000, divisor: 100_000_000, dp: 0, suffix: '억' }
] as const;

/**
 * Format a KRW price/size as 억/조. Mirrors the byte-identical
 * `formatPriceKrw` previously defined in the sponsors / deal-flow / comps
 * admin pages.
 */
export function formatPriceKrw(value: number | null): string {
  if (value === null || value === undefined) return '—';
  return formatKrwCompact(value, {
    tiers: PRICE_KRW_TIERS.map((tier) => ({ ...tier })),
    fallback: (krw) => formatNumber(krw, 0)
  });
}

const PRICE_KRW_SUFFIXED_TIERS = [
  { min: 1_000_000_000_000, divisor: 1_000_000_000_000, dp: 2, suffix: '조 KRW' },
  { min: 100_000_000, divisor: 100_000_000, dp: 0, suffix: '억 KRW' }
] as const;

/**
 * Variant of {@link formatPriceKrw} that appends " KRW" to every tier and
 * the fallback. Mirrors the `formatPriceKrw` previously defined in the
 * quarterly-research admin page.
 */
export function formatPriceKrwWithCode(value: number | null): string {
  if (value === null || value === undefined) return '—';
  return formatKrwCompact(value, {
    tiers: PRICE_KRW_SUFFIXED_TIERS.map((tier) => ({ ...tier })),
    fallback: (krw) => `${formatNumber(krw, 0)} KRW`
  });
}
