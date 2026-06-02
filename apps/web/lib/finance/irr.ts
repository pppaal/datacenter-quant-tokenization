/**
 * Canonical IRR / NPV / XIRR primitives.
 *
 * Historically the codebase carried ~5 near-duplicate IRR/NPV implementations,
 * each with subtly different conventions (return scale ×100 vs raw fraction,
 * convergence tolerance, sign-handling, rounding, period exponent). Merging them
 * naively would have shifted last-digit results. Instead this module exposes the
 * union of those algorithms with EXPLICIT options so every prior caller can ask
 * for its exact historical behavior — output stays byte-identical.
 *
 * Three algorithm families live here:
 *
 *  1. `computeIrr` — period-indexed Newton-Raphson with a bisection fallback.
 *     Canonical algorithm lifted from `valuation/return-metrics.ts`. Supports a
 *     mid-year discounting convention and returns a percent (×100, 4dp) by default.
 *
 *  2. `computeXirr` — date-aware (act/365) Newton-Raphson with bisection fallback,
 *     lifted from `services/fund-nav.ts`. Returns a percent (×100, 4dp).
 *
 *  3. `bisectIrr` — a pure-bisection solver. The waterfall (european/american)
 *     and fx-hedge modules each used a small private bisection; they differ in
 *     branch rule, tolerance, sign-guard, return scale and rounding. Those exact
 *     variants are reproduced via options rather than re-implemented per file.
 *
 * Pure / DB-free.
 */

import { MS_PER_DAY } from './constants';

// ---------------------------------------------------------------------------
// Period-indexed NPV (return-metrics family)
// ---------------------------------------------------------------------------

/**
 * Period exponent for cash-flow index `i`.
 *  - End-of-year: index 0 is at t=0 (initial outlay), index k at t=k.
 *  - Mid-year: index 0 stays at t=0 (initial outlay arrives up front), but each
 *    operating flow at index k≥1 is discounted at `k - 0.5` (arrives mid-period).
 *    The terminal/exit lump is baked into the last index's cash flow and is
 *    therefore discounted at the same mid-year exponent here; callers that need
 *    end-of-period terminal handling discount it separately (see lease-dcf).
 */
function periodExponent(i: number, midYear: boolean): number {
  if (i === 0) return 0;
  return midYear ? i - 0.5 : i;
}

/** Period-indexed NPV at `rate`. Index 0 is t=0. */
export function npv(cashFlows: number[], rate: number, midYear = false): number {
  let result = 0;
  for (let i = 0; i < cashFlows.length; i++) {
    result += cashFlows[i]! / (1 + rate) ** periodExponent(i, midYear);
  }
  return result;
}

function npvDerivative(cashFlows: number[], rate: number, midYear = false): number {
  let result = 0;
  for (let i = 1; i < cashFlows.length; i++) {
    const t = periodExponent(i, midYear);
    result -= (t * cashFlows[i]!) / (1 + rate) ** (t + 1);
  }
  return result;
}

/**
 * Period-indexed IRR via Newton-Raphson with a bisection fallback.
 *
 * Returns the rate as a percentage rounded to 4dp (e.g. 10 for 10%), or null when
 * undefined (no sign change, < 2 flows, or non-convergence). This is the historical
 * `valuation/return-metrics.ts#computeIrr` behavior, preserved exactly for its
 * callers (return-metrics, sensitivity).
 */
export function computeIrr(
  cashFlows: number[],
  maxIterations = 200,
  tolerance = 1e-8,
  midYear = false
): number | null {
  if (cashFlows.length < 2) return null;

  const hasPositive = cashFlows.some((cf) => cf > 0);
  const hasNegative = cashFlows.some((cf) => cf < 0);
  if (!hasPositive || !hasNegative) return null;

  let rate = 0.1;

  for (let i = 0; i < maxIterations; i++) {
    const f = npv(cashFlows, rate, midYear);
    const fPrime = npvDerivative(cashFlows, rate, midYear);

    if (Math.abs(fPrime) < 1e-14) break;

    const newRate = rate - f / fPrime;

    if (Math.abs(newRate - rate) < tolerance) {
      if (newRate > -1 && newRate < 10) return Number((newRate * 100).toFixed(4));
      return null;
    }

    rate = newRate;
    if (rate <= -1) rate = -0.99;
    if (rate > 10) rate = 10;
  }

  // Fallback: bisection if Newton didn't converge
  let lo = -0.99;
  let hi = 5.0;
  let fLo = npv(cashFlows, lo, midYear);

  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fMid = npv(cashFlows, mid, midYear);

    if (Math.abs(fMid) < tolerance || (hi - lo) / 2 < tolerance) {
      return Number((mid * 100).toFixed(4));
    }

    if (fLo * fMid < 0) {
      hi = mid;
    } else {
      lo = mid;
      fLo = fMid;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Pure-bisection IRR (waterfall + fx-hedge family)
// ---------------------------------------------------------------------------

/** Simple integer-period NPV used by the bisection solvers. Index 0 is t=0. */
function npvInteger(rate: number, flows: number[]): number {
  let sum = 0;
  for (let i = 0; i < flows.length; i++) {
    sum += flows[i]! / Math.pow(1 + rate, i);
  }
  return sum;
}

export type BisectIrrOptions = {
  /** Lower rate bound (raw fraction). Default -0.99. */
  lo?: number;
  /** Upper rate bound (raw fraction). Default 10. */
  hi?: number;
  /** Iteration count. Default 100. */
  iterations?: number;
  /** Absolute-NPV convergence threshold. */
  tolerance?: number;
  /**
   * Branch rule for narrowing the bracket:
   *  - 'value-sign'   : if npv(mid) > 0 move `lo` up else move `hi` down
   *                     (european waterfall; assumes NPV decreasing in rate).
   *  - 'product-sign' : track the actual sign change via loV*midV
   *                     (american waterfall + fx-hedge).
   */
  branch?: 'value-sign' | 'product-sign';
  /**
   * When true (product-sign callers), return null up-front if the endpoints do
   * not bracket a root (loV*hiV > 0). Matches american/fx-hedge `solveIrr`.
   */
  requireBracket?: boolean;
  /**
   * Output scale:
   *  - 'fraction' : return the raw rate (american waterfall, fx-hedge).
   *  - 'percent'  : return rate × 100 (european waterfall).
   */
  scale?: 'fraction' | 'percent';
  /** Decimal places to round to when `scale === 'percent'`. Ignored otherwise. */
  percentDecimals?: number;
};

/**
 * Pure-bisection IRR solver covering the waterfall (european/american) and
 * fx-hedge variants. Each historical caller supplies options reproducing its
 * exact loop (branch rule, tolerance, sign-guard, scale, rounding) so results
 * stay byte-identical. Returns null for < 2 flows or no positive/negative flow.
 */
export function bisectIrr(flows: number[], options: BisectIrrOptions = {}): number | null {
  const {
    lo: loStart = -0.99,
    hi: hiStart = 10,
    iterations = 100,
    tolerance = 1e-6,
    branch = 'product-sign',
    requireBracket = false,
    scale = 'fraction',
    percentDecimals = 3
  } = options;

  if (flows.length < 2) return null;
  if (!flows.some((f) => f > 0) || !flows.some((f) => f < 0)) return null;

  let lo = loStart;
  let hi = hiStart;

  const finalize = (rate: number): number =>
    scale === 'percent' ? Number((rate * 100).toFixed(percentDecimals)) : rate;

  if (branch === 'value-sign') {
    // European waterfall: assumes NPV monotonically decreasing in rate.
    for (let i = 0; i < iterations; i++) {
      const mid = (lo + hi) / 2;
      const val = npvInteger(mid, flows);
      if (Math.abs(val) < tolerance) {
        return finalize(mid);
      }
      if (val > 0) lo = mid;
      else hi = mid;
    }
    return finalize((lo + hi) / 2);
  }

  // product-sign: american waterfall + fx-hedge.
  let loV = npvInteger(lo, flows);
  const hiV = npvInteger(hi, flows);
  if (requireBracket && loV * hiV > 0) return null;
  for (let i = 0; i < iterations; i++) {
    const mid = (lo + hi) / 2;
    const midV = npvInteger(mid, flows);
    if (Math.abs(midV) < tolerance) return finalize(mid);
    if (loV * midV < 0) {
      hi = mid;
    } else {
      lo = mid;
      loV = midV;
    }
  }
  return finalize((lo + hi) / 2);
}

// ---------------------------------------------------------------------------
// Date-aware XIRR (fund-nav family)
// ---------------------------------------------------------------------------

export type DatedCashflow = { date: Date; amountKrw: number };

const DAYS_PER_YEAR = 365;

function xnpv(rate: number, flows: { years: number; amount: number }[]): number {
  let result = 0;
  for (const f of flows) {
    result += f.amount / Math.pow(1 + rate, f.years);
  }
  return result;
}

function xnpvDerivative(rate: number, flows: { years: number; amount: number }[]): number {
  let result = 0;
  for (const f of flows) {
    if (f.years === 0) continue;
    result -= (f.years * f.amount) / Math.pow(1 + rate, f.years + 1);
  }
  return result;
}

/**
 * XIRR: the annualized internal rate of return for a series of dated cashflows
 * (negatives = outflows/contributions, positives = inflows/distributions+NAV).
 * Returns the rate as a percentage (e.g. 12.34), or null when undefined
 * (no sign change, < 2 flows, or non-convergence).
 *
 * Newton-Raphson with a bisection fallback, generalized to act/365 dating.
 * Lifted unchanged from `services/fund-nav.ts#computeXirr`.
 */
export function computeXirr(
  cashflows: DatedCashflow[],
  maxIterations = 200,
  tolerance = 1e-7
): number | null {
  const valid = cashflows.filter((c) => !Number.isNaN(c.date.getTime()) && c.amountKrw !== 0);
  if (valid.length < 2) return null;

  const hasPositive = valid.some((c) => c.amountKrw > 0);
  const hasNegative = valid.some((c) => c.amountKrw < 0);
  if (!hasPositive || !hasNegative) return null;

  const sorted = [...valid].sort((a, b) => a.date.getTime() - b.date.getTime());
  const t0 = sorted[0]!.date.getTime();
  const flows = sorted.map((c) => ({
    years: (c.date.getTime() - t0) / MS_PER_DAY / DAYS_PER_YEAR,
    amount: c.amountKrw
  }));

  let rate = 0.1;
  for (let i = 0; i < maxIterations; i++) {
    const f = xnpv(rate, flows);
    const fp = xnpvDerivative(rate, flows);
    if (Math.abs(fp) < 1e-14) break;
    const next = rate - f / fp;
    if (Math.abs(next - rate) < tolerance) {
      if (next > -0.9999 && next < 100) return Number((next * 100).toFixed(4));
      break;
    }
    rate = next;
    if (rate <= -1) rate = -0.9999;
    if (rate > 100) rate = 100;
  }

  // Bisection fallback.
  let lo = -0.9999;
  let hi = 100;
  let fLo = xnpv(lo, flows);
  for (let i = 0; i < 300; i++) {
    const mid = (lo + hi) / 2;
    const fMid = xnpv(mid, flows);
    if (Math.abs(fMid) < 1 || (hi - lo) / 2 < tolerance) {
      return Number((mid * 100).toFixed(4));
    }
    if (fLo * fMid < 0) {
      hi = mid;
    } else {
      lo = mid;
      fLo = fMid;
    }
  }
  return null;
}
