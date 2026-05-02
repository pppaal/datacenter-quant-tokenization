/**
 * Distribution waterfall — translates SPV economics from the
 * stored assumptions blob (managementFeePct, performanceFeePct,
 * promoteThresholdPct, promoteSharePct) plus the run's projected
 * IRR into the LP / GP split that LPs expect to see in the IM.
 *
 * Convention: the threshold is the LP preferred return (hurdle).
 * Below the hurdle, all distributions go LP. Above the hurdle, the
 * GP earns its promote share, with the rest to LP. A simplified
 * "two-tier American" waterfall — sufficient for IM readability
 * without a full per-tier modeling engine.
 */

export type WaterfallTier = {
  tier: string;
  irrThresholdPct: number | null;
  lpSharePct: number;
  gpSharePct: number;
  description: string;
};

export type WaterfallSummary = {
  hurdleRatePct: number | null;
  promoteSharePct: number | null;
  managementFeePct: number | null;
  performanceFeePct: number | null;
  reserveTargetMonths: number | null;
  /** The deal's projected base-case equity IRR. */
  projectedEquityIrrPct: number | null;
  /** Estimated LP take vs GP take at the projected IRR. */
  lpTakePct: number | null;
  gpTakePct: number | null;
  tiers: WaterfallTier[];
};

type SpvLike = {
  managementFeePct?: number | null;
  performanceFeePct?: number | null;
  promoteThresholdPct?: number | null;
  promoteSharePct?: number | null;
  reserveTargetMonths?: number | null;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export function readSpvFromAssumptions(assumptions: unknown): SpvLike | null {
  const root = asRecord(assumptions);
  const spv = asRecord(root?.spv);
  if (!spv) return null;
  return {
    managementFeePct: num(spv.managementFeePct),
    performanceFeePct: num(spv.performanceFeePct),
    promoteThresholdPct: num(spv.promoteThresholdPct),
    promoteSharePct: num(spv.promoteSharePct),
    reserveTargetMonths: num(spv.reserveTargetMonths)
  };
}

export function buildWaterfall(
  spv: SpvLike | null,
  projectedEquityIrrPct: number | null
): WaterfallSummary {
  const hurdle = spv?.promoteThresholdPct ?? null;
  const promote = spv?.promoteSharePct ?? null;
  const tiers: WaterfallTier[] = [];

  if (hurdle !== null) {
    tiers.push({
      tier: 'Tier 1 — return of capital',
      irrThresholdPct: 0,
      lpSharePct: 100,
      gpSharePct: 0,
      description: 'All distributions to LP until invested capital is returned.'
    });
    tiers.push({
      tier: 'Tier 2 — preferred return',
      irrThresholdPct: hurdle,
      lpSharePct: 100,
      gpSharePct: 0,
      description: `LP earns 100% until the ${hurdle.toFixed(1)}% preferred return is achieved.`
    });
    if (promote !== null) {
      // Many waterfalls include a GP catch-up that closes the gap to
      // the carried-interest split; we render it as an explicit tier
      // for IM readability.
      tiers.push({
        tier: 'Tier 3 — GP catch-up',
        irrThresholdPct: hurdle,
        lpSharePct: Math.max(0, 100 - 100), // all to GP during catch-up
        gpSharePct: 100,
        description:
          'GP receives 100% until reaching the carried-interest ratio (illustrative; actual catch-up varies by LPA).'
      });
      tiers.push({
        tier: 'Tier 4 — carried interest',
        irrThresholdPct: hurdle,
        lpSharePct: 100 - promote,
        gpSharePct: promote,
        description: `Above hurdle: ${(100 - promote).toFixed(0)}% LP / ${promote.toFixed(0)}% GP carried interest.`
      });
    }
  }

  // Approximate the LP / GP take at the projected IRR. If IRR is at or
  // below the hurdle, LP keeps 100%. Above hurdle, LP keeps (100 −
  // promoteSharePct) of the excess return; we don't model the catch-up
  // dollar amount here — that requires the full waterfall engine.
  let lpTake: number | null = null;
  let gpTake: number | null = null;
  if (projectedEquityIrrPct !== null && hurdle !== null) {
    if (projectedEquityIrrPct <= hurdle) {
      lpTake = 100;
      gpTake = 0;
    } else if (promote !== null) {
      const excess = projectedEquityIrrPct - hurdle;
      const totalReturn = projectedEquityIrrPct;
      // Weighted average split across the hurdle and excess portions.
      const lpDollarEquivalent = hurdle * 1.0 + excess * (1 - promote / 100);
      const gpDollarEquivalent = excess * (promote / 100);
      const total = lpDollarEquivalent + gpDollarEquivalent;
      if (total > 0 && totalReturn > 0) {
        lpTake = (lpDollarEquivalent / total) * 100;
        gpTake = (gpDollarEquivalent / total) * 100;
      }
    }
  }

  return {
    hurdleRatePct: hurdle,
    promoteSharePct: promote,
    managementFeePct: spv?.managementFeePct ?? null,
    performanceFeePct: spv?.performanceFeePct ?? null,
    reserveTargetMonths: spv?.reserveTargetMonths ?? null,
    projectedEquityIrrPct,
    lpTakePct: lpTake,
    gpTakePct: gpTake,
    tiers
  };
}
