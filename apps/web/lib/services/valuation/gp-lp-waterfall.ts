/**
 * GP/LP Promote Waterfall
 *
 * Standard institutional RE PE structure:
 *   Tier 1: Return of Capital (pro rata per commitment split)
 *   Tier 2: Preferred Return (compounded at prefPct → 100% to LP)
 *   Tier 3: GP Catch-up (100% to GP until catch-up split ratio is met)
 *   Tier 4: Residual Promote (splits above catch-up, single tier for now)
 *
 * American (deal-by-deal) waterfall applied to a single-asset 10-year hold.
 * All distribution amounts in KRW; percentages in [0, 1].
 */

function npv(rate: number, flows: number[]): number {
  let sum = 0;
  for (let i = 0; i < flows.length; i++) {
    sum += flows[i]! / Math.pow(1 + rate, i);
  }
  return sum;
}

function solveIrr(flows: number[]): number | null {
  if (flows.length < 2) return null;
  if (!flows.some((f) => f > 0) || !flows.some((f) => f < 0)) return null;
  let lo = -0.99;
  let hi = 10;
  let loV = npv(lo, flows);
  let hiV = npv(hi, flows);
  if (loV * hiV > 0) return null;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    const midV = npv(mid, flows);
    if (Math.abs(midV) < 1e-6) return mid;
    if (loV * midV < 0) {
      hi = mid;
      hiV = midV;
    } else {
      lo = mid;
      loV = midV;
    }
  }
  return (lo + hi) / 2;
}

export type WaterfallConfig = {
  lpCommitmentPct: number;       // e.g., 0.90
  gpCommitmentPct: number;       // e.g., 0.10
  preferredReturnPct: number;    // e.g., 8.0 (annual, compounded)
  catchUpLpSplit: number;        // e.g., 0.80 (LP share in first promote tier, drives catch-up target)
  catchUpGpSplit: number;        // e.g., 0.20 (GP share)
  residualLpSplit: number;       // e.g., 0.80 (above catch-up)
  residualGpSplit: number;       // e.g., 0.20
};

export const DEFAULT_WATERFALL_CONFIG: WaterfallConfig = {
  lpCommitmentPct: 0.90,
  gpCommitmentPct: 0.10,
  preferredReturnPct: 8.0,
  catchUpLpSplit: 0.80,
  catchUpGpSplit: 0.20,
  residualLpSplit: 0.80,
  residualGpSplit: 0.20
};

export type WaterfallInputs = {
  initialEquityKrw: number;
  annualDistributionsKrw: number[];   // Y1..YT after-tax distributions
  netExitProceedsKrw: number;         // lump-sum added to terminal year
  terminalYear: number;
  config: WaterfallConfig;
};

export type WaterfallTier = {
  name: string;
  distributedKrw: number;
  lpKrw: number;
  gpKrw: number;
  cumulativeLpKrw: number;
  cumulativeGpKrw: number;
};

export type GpLpWaterfallResult = {
  config: WaterfallConfig;
  lpCommittedKrw: number;
  gpCommittedKrw: number;
  totalDistributionsKrw: number;
  tiers: WaterfallTier[];
  lpTotalKrw: number;
  gpTotalKrw: number;
  lpMoic: number;
  gpMoic: number;
  lpIrrPct: number | null;
  gpIrrPct: number | null;
  gpPromoteEarnedKrw: number;   // GP distribution above pure pro-rata (the "carry")
  proRataLpKrw: number;         // what LP would have received without promote (reference)
  proRataGpKrw: number;
};

export function computeGpLpWaterfall(inputs: WaterfallInputs): GpLpWaterfallResult {
  const { initialEquityKrw, annualDistributionsKrw, netExitProceedsKrw, terminalYear, config } = inputs;

  const lpCommitted = Math.round(initialEquityKrw * config.lpCommitmentPct);
  const gpCommitted = Math.round(initialEquityKrw * config.gpCommitmentPct);

  // Per-year flows with net exit lumped into terminal year (only positive flows
  // pass through the waterfall — negative years just mean no distribution).
  const yearFlows = annualDistributionsKrw.slice();
  const termIdx = Math.max(0, Math.min(yearFlows.length - 1, terminalYear - 1));
  yearFlows[termIdx] = (yearFlows[termIdx] ?? 0) + netExitProceedsKrw;
  const totalDistributions = yearFlows.reduce((s, x) => s + Math.max(0, x), 0);

  // Year-by-year simulation: capital is returned and LP pref accrues on the
  // remaining-outstanding LP balance (compounding on unpaid pref). This gives a
  // true tier flow per year, so LP IRR reflects when LP actually got paid (capital
  // + pref early, residual late) instead of a flat pro-rata share of the pool.

  const prefRate = config.preferredReturnPct / 100;
  let lpCapitalRemaining = lpCommitted;
  let gpCapitalRemaining = gpCommitted;
  let lpPrefAccrued = 0;
  let cumLpPrefPaid = 0;
  let cumGpCatchupPaid = 0;

  let tier1Total = 0, tier1LpTotal = 0, tier1GpTotal = 0;
  let tier2Total = 0;
  let tier3Total = 0;
  let tier4Total = 0, tier4LpTotal = 0, tier4GpTotal = 0;

  const lpFlows: number[] = [-lpCommitted];
  const gpFlows: number[] = [-gpCommitted];

  for (let i = 0; i < yearFlows.length; i++) {
    // Accrue pref at start of period: compound on existing unpaid pref + new
    // accrual on outstanding capital. Once capital is fully returned, pref
    // continues to compound on the unpaid balance until paid.
    lpPrefAccrued = lpPrefAccrued * (1 + prefRate) + lpCapitalRemaining * prefRate;

    let remaining = Math.max(0, yearFlows[i] ?? 0);
    let yLP = 0;
    let yGP = 0;

    // Tier 1: Return of Capital pro rata to outstanding capital
    const totalCapOutstanding = lpCapitalRemaining + gpCapitalRemaining;
    if (remaining > 0 && totalCapOutstanding > 0) {
      const t1 = Math.min(remaining, totalCapOutstanding);
      const t1Lp = Math.min(lpCapitalRemaining, Math.round(t1 * (lpCapitalRemaining / totalCapOutstanding)));
      const t1Gp = Math.min(gpCapitalRemaining, t1 - t1Lp);
      lpCapitalRemaining -= t1Lp;
      gpCapitalRemaining -= t1Gp;
      yLP += t1Lp;
      yGP += t1Gp;
      remaining -= t1Lp + t1Gp;
      tier1Total += t1Lp + t1Gp;
      tier1LpTotal += t1Lp;
      tier1GpTotal += t1Gp;
    }

    // Tier 2: LP Preferred Return (100% to LP, up to accrued pref)
    if (remaining > 0 && lpPrefAccrued > 0) {
      const t2 = Math.min(remaining, Math.round(lpPrefAccrued));
      yLP += t2;
      lpPrefAccrued -= t2;
      cumLpPrefPaid += t2;
      remaining -= t2;
      tier2Total += t2;
    }

    // Tier 3: GP Catch-up — bring cumulative GP catch-up to the catchUp split
    // of the pref pool: target GP catchup = cumLpPrefPaid × gpSplit / lpSplit.
    // GP receives 100% of distributions until the cumulative target is hit.
    if (remaining > 0 && config.catchUpLpSplit > 0) {
      const target = Math.round(cumLpPrefPaid * (config.catchUpGpSplit / config.catchUpLpSplit));
      const shortfall = Math.max(0, target - cumGpCatchupPaid);
      const t3 = Math.min(remaining, shortfall);
      yGP += t3;
      cumGpCatchupPaid += t3;
      remaining -= t3;
      tier3Total += t3;
    }

    // Tier 4: Residual Promote — split per residual ratio
    if (remaining > 0) {
      const t4 = remaining;
      const t4Lp = Math.round(t4 * config.residualLpSplit);
      const t4Gp = t4 - t4Lp;
      yLP += t4Lp;
      yGP += t4Gp;
      tier4Total += t4;
      tier4LpTotal += t4Lp;
      tier4GpTotal += t4Gp;
    }

    lpFlows.push(yLP);
    gpFlows.push(yGP);
  }

  // Cumulative tier rollups for the summary (post-simulation)
  const cumLp1 = tier1LpTotal;
  const cumGp1 = tier1GpTotal;
  const cumLp2 = cumLp1 + tier2Total;        // tier 2 is 100% LP
  const cumGp2 = cumGp1;
  const cumLp3 = cumLp2;                     // tier 3 is 100% GP
  const cumGp3 = cumGp2 + tier3Total;
  const cumLp4 = cumLp3 + tier4LpTotal;
  const cumGp4 = cumGp3 + tier4GpTotal;

  const tiers: WaterfallTier[] = [
    {
      name: '1. Return of Capital',
      distributedKrw: tier1Total,
      lpKrw: tier1LpTotal,
      gpKrw: tier1GpTotal,
      cumulativeLpKrw: cumLp1,
      cumulativeGpKrw: cumGp1
    },
    {
      name: `2. Preferred Return (${config.preferredReturnPct}% → 100% LP)`,
      distributedKrw: tier2Total,
      lpKrw: tier2Total,
      gpKrw: 0,
      cumulativeLpKrw: cumLp2,
      cumulativeGpKrw: cumGp2
    },
    {
      name: `3. GP Catch-up (100% GP to ${config.catchUpLpSplit * 100}/${config.catchUpGpSplit * 100})`,
      distributedKrw: tier3Total,
      lpKrw: 0,
      gpKrw: tier3Total,
      cumulativeLpKrw: cumLp3,
      cumulativeGpKrw: cumGp3
    },
    {
      name: `4. Residual Promote (${config.residualLpSplit * 100}/${config.residualGpSplit * 100})`,
      distributedKrw: tier4Total,
      lpKrw: tier4LpTotal,
      gpKrw: tier4GpTotal,
      cumulativeLpKrw: cumLp4,
      cumulativeGpKrw: cumGp4
    }
  ];

  const lpTotal = cumLp4;
  const gpTotal = cumGp4;

  // IRR computed on actual per-year tier flows (capital + pref hits LP first,
  // promote — when it triggers — hits GP later). Replaces the prior pro-rata
  // approximation which over-stated LP IRR by ignoring tier timing.
  const lpIrr = solveIrr(lpFlows);
  const gpIrr = solveIrr(gpFlows);

  const lpMoic = lpCommitted > 0 ? lpTotal / lpCommitted : 0;
  const gpMoic = gpCommitted > 0 ? gpTotal / gpCommitted : 0;

  // Pro-rata reference: what each side would receive without promote
  const proRataLp = Math.round(totalDistributions * config.lpCommitmentPct);
  const proRataGp = totalDistributions - proRataLp;
  const gpPromoteEarned = gpTotal - proRataGp;

  return {
    config,
    lpCommittedKrw: lpCommitted,
    gpCommittedKrw: gpCommitted,
    totalDistributionsKrw: totalDistributions,
    tiers,
    lpTotalKrw: lpTotal,
    gpTotalKrw: gpTotal,
    lpMoic,
    gpMoic,
    lpIrrPct: lpIrr != null ? lpIrr * 100 : null,
    gpIrrPct: gpIrr != null ? gpIrr * 100 : null,
    gpPromoteEarnedKrw: gpPromoteEarned,
    proRataLpKrw: proRataLp,
    proRataGpKrw: proRataGp
  };
}
