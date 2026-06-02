/**
 * Shared "decimal-ish" coercion for IM financial helpers.
 *
 * Prisma `Decimal` columns surface either as a plain `number` or as an
 * object exposing `.toNumber()` depending on the driver/serialization path,
 * and many inputs are nullable. `Decimalish` captures that union and
 * `toNum` collapses it to a finite `number | null`.
 *
 * Previously this exact type + helper were copy-pasted into cash-flow.ts,
 * counterparty-rollup.ts and credit-analysis.ts; this is now their single
 * home.
 */
export type Decimalish = number | { toNumber: () => number } | null | undefined;

export function toNum(v: Decimalish): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof (v as { toNumber?: () => number }).toNumber === 'function') {
    const n = (v as { toNumber: () => number }).toNumber();
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
