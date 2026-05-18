import type {
  DebtScheduleResult,
  EquityWaterfallResult,
  LeaseDcfResult,
  ProFormaBaseCase
} from '@/lib/services/valuation/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ReturnMetrics = {
  equityIrr: number | null;
  leveragedIrr: number | null;
  unleveragedIrr: number | null;
  equityMultiple: number;
  cashOnCashByYear: number[];
  averageCashOnCash: number;
  peakEquityExposureKrw: number;
  paybackYear: number | null;
};

// ---------------------------------------------------------------------------
// IRR via Newton-Raphson
// ---------------------------------------------------------------------------

function npv(cashFlows: number[], rate: number): number {
  let result = 0;
  for (let i = 0; i < cashFlows.length; i++) {
    result += cashFlows[i]! / (1 + rate) ** i;
  }
  return result;
}

function npvDerivative(cashFlows: number[], rate: number): number {
  let result = 0;
  for (let i = 1; i < cashFlows.length; i++) {
    result -= (i * cashFlows[i]!) / (1 + rate) ** (i + 1);
  }
  return result;
}

export function computeIrr(
  cashFlows: number[],
  maxIterations = 200,
  tolerance = 1e-8
): number | null {
  if (cashFlows.length < 2) return null;

  const hasPositive = cashFlows.some((cf) => cf > 0);
  const hasNegative = cashFlows.some((cf) => cf < 0);
  if (!hasPositive || !hasNegative) return null;

  let rate = 0.1;

  for (let i = 0; i < maxIterations; i++) {
    const f = npv(cashFlows, rate);
    const fPrime = npvDerivative(cashFlows, rate);

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
  let fLo = npv(cashFlows, lo);

  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fMid = npv(cashFlows, mid);

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
// Return Metrics Computation
// ---------------------------------------------------------------------------

export function computeReturnMetrics({
  leaseDcf,
  debtSchedule,
  equityWaterfall,
  totalCapexKrw
}: {
  leaseDcf: LeaseDcfResult;
  debtSchedule: DebtScheduleResult;
  equityWaterfall: EquityWaterfallResult;
  totalCapexKrw: number;
}): ReturnMetrics {
  const initialEquityKrw = totalCapexKrw - debtSchedule.initialDebtFundingKrw;

  // --- Levered equity cash flows (for equity IRR) ---
  // Year 0: negative initial equity outlay
  // Year 1..N: after-tax distribution
  // Year N: + net exit proceeds
  const leveredCashFlows: number[] = [-initialEquityKrw];
  for (let i = 0; i < equityWaterfall.years.length; i++) {
    const year = equityWaterfall.years[i]!;
    const isTerminal = i === equityWaterfall.years.length - 1;
    const cf = year.afterTaxDistributionKrw + (isTerminal ? equityWaterfall.netExitProceedsKrw : 0);
    leveredCashFlows.push(cf);
  }

  // --- Unleveraged cash flows (for project/asset IRR) ---
  // Year 0: negative total capex
  // Year 1..N: NOI (before debt)
  // Year N: + terminal value
  const unleveragedCashFlows: number[] = [-totalCapexKrw];
  for (let i = 0; i < leaseDcf.years.length; i++) {
    const year = leaseDcf.years[i]!;
    const isTerminal = i === leaseDcf.years.length - 1;
    const cf = year.noiKrw + (isTerminal ? leaseDcf.terminalValueKrw : 0);
    unleveragedCashFlows.push(cf);
  }

  const equityIrr = computeIrr(leveredCashFlows);
  const unleveragedIrr = computeIrr(unleveragedCashFlows);

  // Leveraged IRR = same as equity IRR in this context (standard RE terminology)
  const leveragedIrr = equityIrr;

  // --- Equity Multiple (MOIC) ---
  const totalDistributions = equityWaterfall.years.reduce(
    (sum, y) => sum + y.afterTaxDistributionKrw,
    0
  );
  const totalReturn = totalDistributions + equityWaterfall.netExitProceedsKrw;
  const equityMultiple =
    initialEquityKrw > 0 ? Number((totalReturn / initialEquityKrw).toFixed(2)) : 0;

  // --- Cash-on-Cash Return by year ---
  const cashOnCashByYear: number[] = equityWaterfall.years.map((year) =>
    initialEquityKrw > 0
      ? Number(((year.afterTaxDistributionKrw / initialEquityKrw) * 100).toFixed(2))
      : 0
  );
  const averageCashOnCash =
    cashOnCashByYear.length > 0
      ? Number(
          (cashOnCashByYear.reduce((sum, c) => sum + c, 0) / cashOnCashByYear.length).toFixed(2)
        )
      : 0;

  // --- Peak equity exposure ---
  let cumulativeCashFlow = -initialEquityKrw;
  let peakEquityExposureKrw = initialEquityKrw;
  for (const year of equityWaterfall.years) {
    cumulativeCashFlow += year.afterTaxDistributionKrw;
    if (-cumulativeCashFlow > peakEquityExposureKrw) {
      peakEquityExposureKrw = -cumulativeCashFlow;
    }
  }

  // --- Payback year ---
  let paybackYear: number | null = null;
  cumulativeCashFlow = -initialEquityKrw;
  for (const year of equityWaterfall.years) {
    cumulativeCashFlow += year.afterTaxDistributionKrw;
    if (cumulativeCashFlow >= 0) {
      paybackYear = year.year;
      break;
    }
  }

  return {
    equityIrr,
    leveragedIrr,
    unleveragedIrr,
    equityMultiple,
    cashOnCashByYear,
    averageCashOnCash,
    peakEquityExposureKrw,
    paybackYear
  };
}

// ---------------------------------------------------------------------------
// Compute from stored pro forma (for display layer)
// ---------------------------------------------------------------------------

export function computeReturnMetricsFromProForma(
  proForma: ProFormaBaseCase,
  totalCapexKrw: number,
  initialDebtFundingKrw: number,
  netExitProceedsKrw: number,
  terminalValueKrw: number
): ReturnMetrics {
  const initialEquityKrw = totalCapexKrw - initialDebtFundingKrw;
  const years = proForma.years;

  const leveredCashFlows: number[] = [-initialEquityKrw];
  for (let i = 0; i < years.length; i++) {
    const year = years[i]!;
    const isTerminal = i === years.length - 1;
    const cf = year.afterTaxDistributionKrw + (isTerminal ? netExitProceedsKrw : 0);
    leveredCashFlows.push(cf);
  }

  const unleveragedCashFlows: number[] = [-totalCapexKrw];
  for (let i = 0; i < years.length; i++) {
    const year = years[i]!;
    const isTerminal = i === years.length - 1;
    const cf = year.noiKrw + (isTerminal ? terminalValueKrw : 0);
    unleveragedCashFlows.push(cf);
  }

  const equityIrr = computeIrr(leveredCashFlows);
  const unleveragedIrr = computeIrr(unleveragedCashFlows);

  const totalDistributions = years.reduce((sum, y) => sum + y.afterTaxDistributionKrw, 0);
  const totalReturn = totalDistributions + netExitProceedsKrw;
  const equityMultiple =
    initialEquityKrw > 0 ? Number((totalReturn / initialEquityKrw).toFixed(2)) : 0;

  const cashOnCashByYear = years.map((year) =>
    initialEquityKrw > 0
      ? Number(((year.afterTaxDistributionKrw / initialEquityKrw) * 100).toFixed(2))
      : 0
  );
  const averageCashOnCash =
    cashOnCashByYear.length > 0
      ? Number(
          (cashOnCashByYear.reduce((sum, c) => sum + c, 0) / cashOnCashByYear.length).toFixed(2)
        )
      : 0;

  let cumulativeCashFlow = -initialEquityKrw;
  let peakEquityExposureKrw = initialEquityKrw;
  for (const year of years) {
    cumulativeCashFlow += year.afterTaxDistributionKrw;
    if (-cumulativeCashFlow > peakEquityExposureKrw) {
      peakEquityExposureKrw = -cumulativeCashFlow;
    }
  }

  let paybackYear: number | null = null;
  cumulativeCashFlow = -initialEquityKrw;
  for (const year of years) {
    cumulativeCashFlow += year.afterTaxDistributionKrw;
    if (cumulativeCashFlow >= 0) {
      paybackYear = year.year;
      break;
    }
  }

  return {
    equityIrr,
    leveragedIrr: equityIrr,
    unleveragedIrr,
    equityMultiple,
    cashOnCashByYear,
    averageCashOnCash,
    peakEquityExposureKrw,
    paybackYear
  };
}
