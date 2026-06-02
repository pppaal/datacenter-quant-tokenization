/**
 * LP / GP equity waterfall with four-tier European-style distribution:
 *
 *   Tier 1. Return of Capital     — 100% to LP until invested capital is returned.
 *   Tier 2. Preferred Return      — 100% to LP until LP earns `prefRatePct` IRR on contributed capital.
 *   Tier 3. GP Catch-Up           — 100% (or `catchUpSharePct`) to GP until cumulative GP share
 *                                   of profit equals `promoteSharePct`.
 *   Tier 4. Promote               — remaining split LP / GP per `promoteSharePct` (e.g., 80 / 20).
 *
 * Pref accrues on *unreturned* capital at a compounded annual rate. Distributions
 * are consumed top-down through the tiers each year; unused tier capacity carries
 * forward.
 *
 * Distinct from the existing [`equity-waterfall.ts`](./equity-waterfall.ts) which
 * models a single-year exit promote only. This module operates on the 10-year
 * pro-forma and handles per-period distributions.
 *
 * The four-tier mechanics live in the shared [`waterfall-engine.ts`](./waterfall-engine.ts);
 * this module supplies the EUROPEAN strategy: LP-only ROC, rounded simple-on-(cap+pref)
 * accrual, a `cumLpProfit × promote/(100−promote)` catch-up target measured against
 * cumulative GP *profit*, and `catchUpSharePct`-scaled catch-up capacity. The American
 * sibling in [`waterfall-american.ts`](./waterfall-american.ts) keeps its OWN, divergent
 * catch-up definition — the two are intentionally not reconciled.
 *
 * Historical note: this file was previously named `lp-gp-waterfall.ts`.
 */

import { bisectIrr } from '@/lib/finance/irr';

import { initWaterfallState, runWaterfallPeriod, type WaterfallStrategy } from './waterfall-engine';

/**
 * European-waterfall IRR: pure bisection over integer-period flows, value-sign
 * bracket (assumes NPV decreasing in rate), |NPV| < 1 convergence, 100 iters on
 * [-0.99, 10], returned as a percentage rounded to 3dp. Delegates to the
 * canonical `bisectIrr` with options reproducing the prior local helper exactly.
 */
function computeIrr(cashflows: number[]): number | null {
  return bisectIrr(cashflows, {
    lo: -0.99,
    hi: 10,
    iterations: 100,
    tolerance: 1,
    branch: 'value-sign',
    scale: 'percent',
    percentDecimals: 3
  });
}

export type LpGpWaterfallConfig = {
  /** Total equity invested at t=0. LP + GP contribute pro-rata. */
  totalEquityKrw: number;
  /** GP's share of equity contribution (e.g., 5 means 5% GP / 95% LP). */
  gpContributionSharePct: number;
  /** Preferred return rate (typically 7-9% for Korean CRE). */
  prefRatePct: number;
  /** GP's share after catchup (promote). Typical: 20. */
  promoteSharePct: number;
  /** GP catchup share during tier 3 (typically 100 — full catchup). */
  catchUpSharePct: number;
  /** If true, run American-style (deal-by-deal promote from year 1). Default false. */
  dealByDeal?: boolean;
};

export type LpGpWaterfallYear = {
  year: number;
  distributableKrw: number;
  tier1CapitalReturnLpKrw: number;
  tier2PrefLpKrw: number;
  tier3CatchUpGpKrw: number;
  tier4PromoteLpKrw: number;
  tier4PromoteGpKrw: number;
  lpTotalKrw: number;
  gpTotalKrw: number;
  lpUnreturnedCapitalKrw: number;
  lpAccruedPrefKrw: number;
  cumulativeLpKrw: number;
  cumulativeGpKrw: number;
};

export type LpGpWaterfallResult = {
  config: LpGpWaterfallConfig;
  years: LpGpWaterfallYear[];
  lpContributedKrw: number;
  gpContributedKrw: number;
  lpTotalDistributionKrw: number;
  gpTotalDistributionKrw: number;
  lpProfitKrw: number;
  gpProfitKrw: number;
  totalProfitKrw: number;
  gpPromoteCapturedKrw: number;
  lpMoic: number;
  gpMoic: number;
  lpIrrPct: number | null;
  gpIrrPct: number | null;
  promoteHit: boolean;
};

export const DEFAULT_WATERFALL_CONFIG: Omit<LpGpWaterfallConfig, 'totalEquityKrw'> = {
  gpContributionSharePct: 5,
  prefRatePct: 8,
  promoteSharePct: 20,
  catchUpSharePct: 100
};

// ---------------------------------------------------------------------------
// Core calculator
// ---------------------------------------------------------------------------

export function runLpGpWaterfall(
  annualDistributionsKrw: number[],
  exitEquityProceedsKrw: number,
  config: LpGpWaterfallConfig
): LpGpWaterfallResult {
  const cfg = { ...DEFAULT_WATERFALL_CONFIG, ...config };
  const lpContrib = Math.round(cfg.totalEquityKrw * (1 - cfg.gpContributionSharePct / 100));
  const gpContrib = Math.round(cfg.totalEquityKrw * (cfg.gpContributionSharePct / 100));

  // GP capital is not distinguished by the European waterfall (ROC is LP-only),
  // so it is held out of the engine's pro-rata pool.
  const state = initWaterfallState(lpContrib, 0);

  // European strategy — reproduces the legacy per-tier arithmetic exactly.
  const strategy: WaterfallStrategy = {
    rocMode: 'lp-only',
    accruePref: (accruedPref, lpCapitalRemaining) =>
      accruedPref + Math.round((lpCapitalRemaining + accruedPref) * (cfg.prefRatePct / 100)),
    catchUpTarget: (ctx) => {
      if (!(cfg.promoteSharePct > 0 && cfg.promoteSharePct < 100)) return 0;
      const promoteRatio = cfg.promoteSharePct / (100 - cfg.promoteSharePct);
      return Math.max(0, Math.round((ctx.cumLpProfit + ctx.tier2ThisPeriod) * promoteRatio));
    },
    catchUpAlreadyPaid: (ctx) => ctx.cumGpProfit,
    catchUpCapacity: (remaining) => Math.round(remaining * (cfg.catchUpSharePct / 100)),
    carryGpShare: (residual) => Math.round(residual * (cfg.promoteSharePct / 100))
  };

  let cumulativeLp = 0;
  let cumulativeGp = 0;

  const years: LpGpWaterfallYear[] = [];

  // Exit happens at the end of the last year — add exit proceeds to the final
  // operating distribution before running the waterfall on that period.
  const cashflowsByYear = [...annualDistributionsKrw];
  if (cashflowsByYear.length > 0) {
    cashflowsByYear[cashflowsByYear.length - 1]! += exitEquityProceedsKrw;
  }

  for (let i = 0; i < cashflowsByYear.length; i++) {
    const yearNum = i + 1;
    const period = runWaterfallPeriod(cashflowsByYear[i] ?? 0, state, strategy);

    const lpThisYear = period.lpTotal;
    const gpThisYear = period.gpTotal;
    cumulativeLp += lpThisYear;
    cumulativeGp += gpThisYear;

    years.push({
      year: yearNum,
      distributableKrw: period.distributable,
      tier1CapitalReturnLpKrw: period.tier1Lp,
      tier2PrefLpKrw: period.tier2Lp,
      tier3CatchUpGpKrw: period.tier3Gp,
      tier4PromoteLpKrw: period.tier4Lp,
      tier4PromoteGpKrw: period.tier4Gp,
      lpTotalKrw: lpThisYear,
      gpTotalKrw: gpThisYear,
      lpUnreturnedCapitalKrw: period.lpCapitalRemaining,
      lpAccruedPrefKrw: period.accruedPref,
      cumulativeLpKrw: cumulativeLp,
      cumulativeGpKrw: cumulativeGp
    });
  }

  const lpIrr = computeIrr([-lpContrib, ...years.map((y) => y.lpTotalKrw)]);
  const gpIrr = computeIrr([-gpContrib, ...years.map((y) => y.gpTotalKrw)]);

  const gpPromoteCaptured = years.reduce(
    (s, y) => s + y.tier3CatchUpGpKrw + y.tier4PromoteGpKrw,
    0
  );

  return {
    config: cfg,
    years,
    lpContributedKrw: lpContrib,
    gpContributedKrw: gpContrib,
    lpTotalDistributionKrw: cumulativeLp,
    gpTotalDistributionKrw: cumulativeGp,
    lpProfitKrw: cumulativeLp - lpContrib,
    gpProfitKrw: cumulativeGp - gpContrib,
    totalProfitKrw: cumulativeLp + cumulativeGp - lpContrib - gpContrib,
    gpPromoteCapturedKrw: gpPromoteCaptured,
    lpMoic: lpContrib > 0 ? Number((cumulativeLp / lpContrib).toFixed(3)) : 0,
    gpMoic: gpContrib > 0 ? Number((cumulativeGp / gpContrib).toFixed(3)) : 0,
    lpIrrPct: lpIrr,
    gpIrrPct: gpIrr,
    promoteHit: gpPromoteCaptured > 0
  };
}
