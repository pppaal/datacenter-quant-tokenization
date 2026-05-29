import type { AssetStage } from '@prisma/client';

export const stageMultiplier: Record<AssetStage, number> = {
  SCREENING: 0.54,
  LAND_SECURED: 0.62,
  POWER_REVIEW: 0.72,
  PERMITTING: 0.81,
  CONSTRUCTION: 0.9,
  LIVE: 0.97,
  STABILIZED: 1.02
};

export function roundKrw(value: number) {
  return Math.round(value);
}

export function ensureNumber(value: number | null | undefined, fallback: number) {
  return Number.isFinite(value) ? Number(value) : fallback;
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function safeDivide(numerator: number, denominator: number, fallback = 0) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return fallback;
  }

  return numerator / denominator;
}

export function riskFloorRatio(stage: AssetStage, scenarioFactor = 1) {
  const baseRatio = 0.22 + stageMultiplier[stage] * 0.12;
  return Math.min(0.42, Math.max(0.2, baseRatio * scenarioFactor));
}

/**
 * Discount a single cash flow back to present value.
 *
 * Convention:
 *  - End-of-year (default for legacy callers, `midYear = false`): the flow is
 *    assumed to arrive at the END of period `year`, so the discount exponent is
 *    the full integer `year`.
 *  - Mid-year (`midYear = true`): institutional DCF assumes operating cash flows
 *    arrive on average at the MIDDLE of the period, so the exponent is
 *    `year - 0.5`. This raises PV relative to end-of-year discounting by a factor
 *    of roughly `(1 + r)^0.5` (~half a period of discounting unwound).
 *
 * Terminal/exit values are point-in-time events at the horizon and should be
 * discounted at the full horizon exponent (end-of-period) regardless of the
 * mid-year convention — pass `midYear = false` for those.
 */
export function discountValue(value: number, ratePct: number, year: number, midYear = false) {
  const exponent = midYear ? Math.max(year - 0.5, 0) : year;
  return value / (1 + ratePct / 100) ** exponent;
}

export function weightedAverage(
  values: Array<{ value: number | null | undefined; weight: number }>
) {
  const filtered = values.filter(
    (item) => Number.isFinite(item.value) && Number.isFinite(item.weight) && item.weight > 0
  ) as Array<{ value: number; weight: number }>;

  if (filtered.length === 0) return null;

  const totalWeight = filtered.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) return null;

  return filtered.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight;
}
