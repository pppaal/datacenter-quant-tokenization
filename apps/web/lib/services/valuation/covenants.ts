/**
 * Debt covenant engine — goes beyond the single DSCR-floor check and models
 * the actual covenant package typical of Korean CRE senior debt:
 *
 *   1. DSCR minimum (default 1.15×) — already in refinancing.ts, mirrored here.
 *   2. LTV maintenance (default ≤ 65%) — asset value implied by NOI ÷ cap rate
 *      versus outstanding loan balance. Breach triggers cash trap or amort
 *      acceleration.
 *   3. Debt yield (default ≥ 8%) — NOI ÷ debt balance. A rate-agnostic
 *      covenant used by institutional lenders.
 *   4. Cash sweep — when the deal falls below a softer threshold (e.g., DSCR
 *      < 1.25× or LTV > 75%), excess cash above debt service is diverted to
 *      principal paydown instead of equity distribution until the covenant
 *      cures.
 *
 * None of this mutates the pro-forma; it reports what WOULD happen under the
 * covenant package, which is what credit committee and lender conversations
 * actually anchor on.
 */

import type { ProFormaYear } from '@/lib/services/valuation/types';

export type CovenantConfig = {
  dscrFloor: number;
  ltvMaintenancePct: number;
  debtYieldFloorPct: number;
  cashSweepDscrThreshold: number;
  cashSweepLtvThreshold: number;
  capRatePct: number;
};

export type CovenantYearCheck = {
  year: number;
  dscr: number | null;
  ltvPct: number | null;
  debtYieldPct: number | null;
  impliedAssetValueKrw: number;
  dscrBreach: boolean;
  ltvBreach: boolean;
  debtYieldBreach: boolean;
  cashSweepActive: boolean;
  cashSweptKrw: number;
  distributionAfterSweepKrw: number;
};

export type CovenantAnalysis = {
  config: CovenantConfig;
  years: CovenantYearCheck[];
  anyBreach: boolean;
  breachCount: number;
  totalCashSweptKrw: number;
  firstBreachYear: number | null;
  summary: string;
};

export const DEFAULT_COVENANT_CONFIG: CovenantConfig = {
  dscrFloor: 1.15,
  ltvMaintenancePct: 65,
  debtYieldFloorPct: 8.0,
  cashSweepDscrThreshold: 1.25,
  cashSweepLtvThreshold: 75,
  capRatePct: 6.0
};

export function analyzeCovenants(
  years: ProFormaYear[],
  config: Partial<CovenantConfig> = {}
): CovenantAnalysis {
  const cfg: CovenantConfig = { ...DEFAULT_COVENANT_CONFIG, ...config };
  const out: CovenantYearCheck[] = [];

  let totalSwept = 0;
  let breachCount = 0;
  let firstBreach: number | null = null;

  for (const y of years) {
    const impliedValue = cfg.capRatePct > 0 ? Math.round(y.noiKrw / (cfg.capRatePct / 100)) : 0;
    const ltv =
      impliedValue > 0 ? Number(((y.endingDebtBalanceKrw / impliedValue) * 100).toFixed(2)) : null;
    const debtYield =
      y.endingDebtBalanceKrw > 0
        ? Number(((y.noiKrw / y.endingDebtBalanceKrw) * 100).toFixed(2))
        : null;

    const dscrBreach = y.dscr !== null && y.dscr < cfg.dscrFloor;
    const ltvBreach = ltv !== null && ltv > cfg.ltvMaintenancePct;
    const debtYieldBreach = debtYield !== null && debtYield < cfg.debtYieldFloorPct;

    const sweepTriggeredByDscr = y.dscr !== null && y.dscr < cfg.cashSweepDscrThreshold;
    const sweepTriggeredByLtv = ltv !== null && ltv > cfg.cashSweepLtvThreshold;
    const cashSweepActive = sweepTriggeredByDscr || sweepTriggeredByLtv;

    // Cash swept = distribution that would have been paid to equity, diverted
    // to debt paydown. Never negative — if distribution is already negative,
    // sweep is zero (the lender has bigger problems than sweeping).
    const distributableBefore = Math.max(0, y.afterTaxDistributionKrw);
    const sweptThisYear = cashSweepActive ? distributableBefore : 0;
    const distributionAfter = y.afterTaxDistributionKrw - sweptThisYear;

    if (dscrBreach || ltvBreach || debtYieldBreach) {
      breachCount += 1;
      if (firstBreach === null) firstBreach = y.year;
    }
    totalSwept += sweptThisYear;

    out.push({
      year: y.year,
      dscr: y.dscr,
      ltvPct: ltv,
      debtYieldPct: debtYield,
      impliedAssetValueKrw: impliedValue,
      dscrBreach,
      ltvBreach,
      debtYieldBreach,
      cashSweepActive,
      cashSweptKrw: sweptThisYear,
      distributionAfterSweepKrw: distributionAfter
    });
  }

  const summary = buildSummary(cfg, out, breachCount, totalSwept, firstBreach);

  return {
    config: cfg,
    years: out,
    anyBreach: breachCount > 0,
    breachCount,
    totalCashSweptKrw: totalSwept,
    firstBreachYear: firstBreach,
    summary
  };
}

function buildSummary(
  cfg: CovenantConfig,
  checks: CovenantYearCheck[],
  breachCount: number,
  totalSwept: number,
  firstBreach: number | null
): string {
  if (breachCount === 0 && totalSwept === 0) {
    return `Clean across all ${checks.length} years (DSCR ≥ ${cfg.dscrFloor}×, LTV ≤ ${cfg.ltvMaintenancePct}%, debt yield ≥ ${cfg.debtYieldFloorPct}%).`;
  }
  const parts: string[] = [];
  if (breachCount > 0) {
    parts.push(`${breachCount} covenant breach year(s), first in Y${firstBreach}.`);
  }
  if (totalSwept > 0) {
    parts.push(
      `Cash sweep diverts ${(totalSwept / 1e8).toFixed(1)}억 from distributions to principal paydown over the hold.`
    );
  }
  return parts.join(' ');
}
