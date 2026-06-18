/**
 * Single source of truth for the small, generic numeric helpers that were
 * previously copy-pasted across the service layer. Keep this module
 * dependency-free and deterministic — it is imported by both server services
 * and client components, and is exercised directly by `tests/math.test.ts`.
 *
 * Domain-specific variants (e.g. `roundKrw`, `clampConfidence`,
 * `safeDivide`, `weightedAverage`) still live next to the code that owns their
 * semantics — see `lib/services/valuation/utils.ts`.
 */

/**
 * Constrain `value` to the inclusive `[min, max]` range. For any finite inputs
 * this matches every former local `clamp` implementation; callers must pass a
 * sane range (`min <= max`).
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Round to a fixed number of decimal places via `toFixed`, returning a number
 * (not a string). Defaults to a single decimal place, matching the dominant
 * convention in the macro/forecast services. Pass `decimals` explicitly when a
 * different precision is required.
 */
export function round(value: number, decimals = 1): number {
  return Number(value.toFixed(decimals));
}

/**
 * Coerce an unknown value — typically a Prisma `Decimal`, a raw number, or a
 * numeric string — into a finite number, falling back to `fallback` (0 by
 * default) when the value is null/undefined, non-finite, or throws while being
 * converted. This is the defensive superset of the former `toNumber` helpers
 * in the fund-nav / fund-waterfall / operator-dashboard services.
 */
export function toNumber(value: unknown, fallback = 0): number {
  if (value == null) return fallback;
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;

  const maybeDecimal = value as { toNumber?: () => number };
  if (typeof maybeDecimal.toNumber === 'function') {
    try {
      const n = maybeDecimal.toNumber();
      return Number.isFinite(n) ? n : fallback;
    } catch {
      return fallback;
    }
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Like {@link toNumber} but PRESERVES null/undefined (returns `null`) instead of
 * folding them to a fallback. Use at the view/serialization boundary where a
 * missing money value must render as "—", not ₩0 — e.g. converting a Prisma
 * `Decimal | null` column for `formatCurrency(number | null)`.
 */
export function toNumberOrNull(value: unknown): number | null {
  if (value == null) return null;
  const n = toNumber(value, Number.NaN);
  return Number.isFinite(n) ? n : null;
}
