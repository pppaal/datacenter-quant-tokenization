import type {
  CostApproachResult,
  DebtScheduleResult,
  EquityWaterfallResult,
  EquityWaterfallYear,
  LeaseDcfResult,
  PreparedUnderwritingInputs,
  ScenarioInput
} from '@/lib/services/valuation/types';
import { buildYearMap } from '@/lib/services/valuation/year-map';
import { clamp, discountValue } from '@/lib/services/valuation/utils';

export function computeEquityWaterfall(
  prepared: PreparedUnderwritingInputs,
  scenario: ScenarioInput,
  costApproach: CostApproachResult,
  leaseDcf: LeaseDcfResult,
  debtSchedule: DebtScheduleResult
): EquityWaterfallResult {
  const years: EquityWaterfallYear[] = [];
  const debtYearsByYear = buildYearMap(debtSchedule.years);
  const propertyTaxBaseKrw = Math.max(
    costApproach.replacementCostFloorKrw,
    prepared.capexBreakdown.totalCapexKrw * 0.65
  );
  const reserveContributionKrw = debtSchedule.reserveRequirementKrw / 2;
  let leveredEquityPvKrw = 0;

  for (const year of leaseDcf.years) {
    const debtYear = debtYearsByYear.get(year.year);
    const propertyTaxKrw =
      propertyTaxBaseKrw *
      (prepared.taxProfile.propertyTaxPct / 100) *
      (1 + prepared.annualGrowthPct / 100) ** (year.year - 1);
    const insuranceKrw =
      propertyTaxBaseKrw *
      (prepared.taxProfile.insurancePct / 100) *
      (1 + (prepared.annualGrowthPct * 0.5) / 100) ** (year.year - 1);
    const managementFeeKrw = year.revenueKrw * (prepared.spvProfile.managementFeePct / 100);
    const reserveKrw = year.year <= 2 ? reserveContributionKrw : 0;
    const debtServiceKrw = debtYear?.debtServiceKrw ?? 0;
    const preTaxDistributionKrw =
      year.cfadsBeforeDebtKrw -
      propertyTaxKrw -
      insuranceKrw -
      managementFeeKrw -
      reserveKrw -
      debtServiceKrw;
    const corporateTaxKrw =
      Math.max(preTaxDistributionKrw, 0) * (prepared.taxProfile.corporateTaxPct / 100) * 0.9;
    const afterTaxDistributionKrw = preTaxDistributionKrw - corporateTaxKrw;

    years.push({
      year: year.year,
      propertyTaxKrw,
      insuranceKrw,
      managementFeeKrw,
      reserveContributionKrw: reserveKrw,
      debtServiceKrw,
      corporateTaxKrw,
      afterTaxDistributionKrw
    });

    leveredEquityPvKrw += discountValue(
      afterTaxDistributionKrw,
      Math.max(prepared.baseDiscountRatePct + scenario.discountRateShiftPct + 1.2, 8),
      year.year
    );
  }

  const grossExitValueKrw = Math.max(
    leaseDcf.terminalValueKrw,
    costApproach.directComparableValueKrw ?? 0,
    costApproach.replacementCostFloorKrw
  );
  // Disposition tax applies to the realized GAIN (sale value less invested
  // basis), not the gross sale price. taxProfile.exitTaxPct now carries the
  // corporate rate (+ non-business-land surtax), so multiplying it by the gross
  // value would subtract ~24-44% of the whole exit — mirror synthetic-pro-forma,
  // which taxes the gain.
  const exitGainKrw = Math.max(grossExitValueKrw - prepared.capexBreakdown.totalCapexKrw, 0);
  const exitTaxKrw = exitGainKrw * (prepared.taxProfile.exitTaxPct / 100);
  const prePromoteExitProceedsKrw =
    grossExitValueKrw - debtSchedule.endingDebtBalanceKrw - exitTaxKrw;
  // Promote/carry is charged on the EXCESS above the hurdle, never on gross
  // proceeds. The hurdle = invested basis (totalCapex) grossed up by the promote
  // threshold, so the base (a) excludes the LP's RETURNED CAPITAL — GP does not
  // carry a slice of returned principal — and (b) is CONTINUOUS across the
  // threshold: crossing the hurdle by 1 KRW no longer instantly carves ~15-20%
  // off the entire equity exit (the prior gross-proceeds form was both
  // non-monotonic and over-charged). This mirrors the tiered engines
  // (waterfall-european / waterfall-engine), which take carry only on the
  // residual above return-of-capital + pref.
  const promoteHurdleKrw =
    prepared.capexBreakdown.totalCapexKrw * (1 + prepared.spvProfile.promoteThresholdPct / 100);
  const promoteBaseKrw =
    prepared.spvProfile.promoteThresholdPct > 0
      ? Math.max(prePromoteExitProceedsKrw - promoteHurdleKrw, 0)
      : 0;
  const promoteFeeKrw = promoteBaseKrw * (prepared.spvProfile.promoteSharePct / 100);
  const performanceFeeKrw =
    Math.max(prePromoteExitProceedsKrw, 0) * (prepared.spvProfile.performanceFeePct / 100);
  const withholdingKrw =
    Math.max(prePromoteExitProceedsKrw - promoteFeeKrw - performanceFeeKrw, 0) *
    (prepared.taxProfile.withholdingTaxPct / 100) *
    0.35;
  // Operating reserves withheld from years 1-2 distributions are escrowed equity
  // cash, not a permanent cost — they are released back to equity at exit (mirror
  // synthetic-pro-forma, which adds `releasedReservesKrw` to net exit proceeds).
  // Without this the levered-equity path silently destroys that cash and diverges
  // from the headline pro-forma for the same asset.
  const totalReservesReleasedKrw = years.reduce((sum, y) => sum + y.reserveContributionKrw, 0);
  const netExitProceedsKrw =
    prePromoteExitProceedsKrw -
    promoteFeeKrw -
    performanceFeeKrw -
    withholdingKrw +
    totalReservesReleasedKrw;
  const leveredEquityValueKrw =
    leveredEquityPvKrw +
    discountValue(
      netExitProceedsKrw,
      Math.max(prepared.baseDiscountRatePct + scenario.discountRateShiftPct + 1.2, 8),
      leaseDcf.years.length
    );

  const enterpriseEquivalentValueKrw = Math.max(
    leveredEquityValueKrw + debtSchedule.initialDebtFundingKrw,
    costApproach.replacementCostFloorKrw * 0.85
  );

  return {
    years,
    leveredEquityValueKrw,
    enterpriseEquivalentValueKrw,
    grossExitValueKrw,
    promoteFeeKrw,
    exitTaxKrw,
    netExitProceedsKrw: clamp(netExitProceedsKrw, 0, grossExitValueKrw + totalReservesReleasedKrw)
  };
}
