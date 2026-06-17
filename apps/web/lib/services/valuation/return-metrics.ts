import { computeIrr } from '@/lib/finance/irr';
import type {
  DebtScheduleResult,
  EquityWaterfallResult,
  LeaseDcfResult,
  ProFormaBaseCase
} from '@/lib/services/valuation/types';

// Re-exported from the canonical IRR module so existing importers
// (e.g. valuation/sensitivity.ts) keep working unchanged.
export { computeIrr };

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
// Return Metrics Computation
// ---------------------------------------------------------------------------

export function computeReturnMetrics({
  leaseDcf,
  debtSchedule,
  equityWaterfall,
  totalCapexKrw,
  midYear = false
}: {
  leaseDcf: LeaseDcfResult;
  debtSchedule: DebtScheduleResult;
  equityWaterfall: EquityWaterfallResult;
  totalCapexKrw: number;
  /** Discount periodic flows mid-period (institutional convention). Default end-of-year. */
  midYear?: boolean;
}): ReturnMetrics {
  const initialEquityKrw = totalCapexKrw - debtSchedule.initialDebtFundingKrw;

  // --- Levered equity cash flows (for equity IRR) ---
  // Year 0: negative initial equity outlay
  // Year 1..N: after-tax distribution
  // Year N: + net exit proceeds
  // Operating flows only — the exit/terminal lump is passed separately so it is
  // discounted at the full horizon exponent (a point-in-time sale), not at the
  // mid-year exponent that operating distributions use.
  const leveredCashFlows: number[] = [-initialEquityKrw];
  for (let i = 0; i < equityWaterfall.years.length; i++) {
    leveredCashFlows.push(equityWaterfall.years[i]!.afterTaxDistributionKrw);
  }

  // --- Unleveraged cash flows (for project/asset IRR) ---
  // Year 0: negative total capex; Year 1..N: NOI (before debt); terminal separate.
  const unleveragedCashFlows: number[] = [-totalCapexKrw];
  for (let i = 0; i < leaseDcf.years.length; i++) {
    unleveragedCashFlows.push(leaseDcf.years[i]!.noiKrw);
  }

  const equityIrr = computeIrr(
    leveredCashFlows,
    200,
    1e-8,
    midYear,
    equityWaterfall.netExitProceedsKrw
  );
  const unleveragedIrr = computeIrr(
    unleveragedCashFlows,
    200,
    1e-8,
    midYear,
    leaseDcf.terminalValueKrw
  );

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
  terminalValueKrw: number,
  /** Discount periodic flows mid-period (institutional convention). Default end-of-year. */
  midYear = false
): ReturnMetrics {
  const initialEquityKrw = totalCapexKrw - initialDebtFundingKrw;
  const years = proForma.years;

  // Operating flows only; exit/terminal lumps passed separately (full-exponent
  // discounting at the horizon, even under mid-year).
  const leveredCashFlows: number[] = [-initialEquityKrw];
  for (let i = 0; i < years.length; i++) {
    leveredCashFlows.push(years[i]!.afterTaxDistributionKrw);
  }

  const unleveragedCashFlows: number[] = [-totalCapexKrw];
  for (let i = 0; i < years.length; i++) {
    unleveragedCashFlows.push(years[i]!.noiKrw);
  }

  const equityIrr = computeIrr(leveredCashFlows, 200, 1e-8, midYear, netExitProceedsKrw);
  const unleveragedIrr = computeIrr(unleveragedCashFlows, 200, 1e-8, midYear, terminalValueKrw);

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
