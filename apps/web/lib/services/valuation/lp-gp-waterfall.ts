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
 */

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

  let lpUnreturnedCapital = lpContrib;
  let lpAccruedPref = 0;
  let cumulativeLpProfit = 0;
  let cumulativeGpProfit = 0;
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
    const raw = Math.max(0, Math.round(cashflowsByYear[i] ?? 0));

    // Accrue preferred return on unreturned LP capital + previously accrued pref
    // (compounding annually — European-style standard).
    lpAccruedPref += Math.round((lpUnreturnedCapital + lpAccruedPref) * (cfg.prefRatePct / 100));

    let remaining = raw;
    let tier1 = 0;
    let tier2 = 0;
    let tier3 = 0;
    let tier4Lp = 0;
    let tier4Gp = 0;

    // Tier 1: Return of capital (LP only)
    const roc = Math.min(remaining, lpUnreturnedCapital);
    tier1 += roc;
    lpUnreturnedCapital -= roc;
    remaining -= roc;

    // Tier 2: Preferred return (LP only)
    if (remaining > 0 && lpAccruedPref > 0) {
      const pref = Math.min(remaining, lpAccruedPref);
      tier2 += pref;
      lpAccruedPref -= pref;
      remaining -= pref;
    }

    // Tier 3: GP Catch-Up — pay GP until cumulative GP profit ratio equals promote target.
    // Target: gpProfit / (lpProfit + gpProfit) = promoteSharePct/100.
    // Equivalently: gpProfit = (promote/(100-promote)) * lpProfit.
    if (remaining > 0 && cfg.promoteSharePct > 0 && cfg.promoteSharePct < 100) {
      const promoteRatio = cfg.promoteSharePct / (100 - cfg.promoteSharePct);
      const targetGp = Math.max(0, Math.round((cumulativeLpProfit + tier2) * promoteRatio));
      const gpShortfall = Math.max(0, targetGp - cumulativeGpProfit);
      if (gpShortfall > 0) {
        const catchUpCapacity = Math.round(remaining * (cfg.catchUpSharePct / 100));
        const catchUp = Math.min(catchUpCapacity, gpShortfall);
        tier3 += catchUp;
        remaining -= catchUp;
      }
    }

    // Tier 4: Promote split on remainder.
    if (remaining > 0) {
      const gpShare = Math.round(remaining * (cfg.promoteSharePct / 100));
      const lpShare = remaining - gpShare;
      tier4Lp += lpShare;
      tier4Gp += gpShare;
      remaining -= lpShare + gpShare;
    }

    const lpThisYear = tier1 + tier2 + tier4Lp;
    const gpThisYear = tier3 + tier4Gp;

    // Profit tracking: ROC is not profit; everything else is.
    cumulativeLpProfit += tier2 + tier4Lp;
    cumulativeGpProfit += tier3 + tier4Gp;
    cumulativeLp += lpThisYear;
    cumulativeGp += gpThisYear;

    years.push({
      year: yearNum,
      distributableKrw: raw,
      tier1CapitalReturnLpKrw: tier1,
      tier2PrefLpKrw: tier2,
      tier3CatchUpGpKrw: tier3,
      tier4PromoteLpKrw: tier4Lp,
      tier4PromoteGpKrw: tier4Gp,
      lpTotalKrw: lpThisYear,
      gpTotalKrw: gpThisYear,
      lpUnreturnedCapitalKrw: lpUnreturnedCapital,
      lpAccruedPrefKrw: lpAccruedPref,
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

// ---------------------------------------------------------------------------
// IRR helper (Newton-Raphson with bisection fallback)
// ---------------------------------------------------------------------------

function npv(rate: number, cashflows: number[]): number {
  return cashflows.reduce((sum, cf, i) => sum + cf / Math.pow(1 + rate, i), 0);
}

function computeIrr(cashflows: number[]): number | null {
  if (cashflows.length < 2) return null;
  const positive = cashflows.some((c) => c > 0);
  const negative = cashflows.some((c) => c < 0);
  if (!positive || !negative) return null;

  let low = -0.99;
  let high = 10;
  for (let i = 0; i < 100; i++) {
    const mid = (low + high) / 2;
    const val = npv(mid, cashflows);
    if (Math.abs(val) < 1) {
      return Number((mid * 100).toFixed(3));
    }
    if (val > 0) low = mid;
    else high = mid;
  }
  return Number((((low + high) / 2) * 100).toFixed(3));
}
