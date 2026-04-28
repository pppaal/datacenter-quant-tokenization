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
  const exitTaxKrw = grossExitValueKrw * (prepared.taxProfile.exitTaxPct / 100);
  const prePromoteExitProceedsKrw =
    grossExitValueKrw - debtSchedule.endingDebtBalanceKrw - exitTaxKrw;
  const promoteApplies =
    prepared.spvProfile.promoteThresholdPct > 0 &&
    prePromoteExitProceedsKrw >
      prepared.capexBreakdown.totalCapexKrw * (1 + prepared.spvProfile.promoteThresholdPct / 100);
  const promoteFeeKrw = promoteApplies
    ? prePromoteExitProceedsKrw * (prepared.spvProfile.promoteSharePct / 100)
    : 0;
  const performanceFeeKrw =
    Math.max(prePromoteExitProceedsKrw, 0) * (prepared.spvProfile.performanceFeePct / 100);
  const withholdingKrw =
    Math.max(prePromoteExitProceedsKrw - promoteFeeKrw - performanceFeeKrw, 0) *
    (prepared.taxProfile.withholdingTaxPct / 100) *
    0.35;
  const netExitProceedsKrw =
    prePromoteExitProceedsKrw - promoteFeeKrw - performanceFeeKrw - withholdingKrw;
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
    netExitProceedsKrw: clamp(netExitProceedsKrw, 0, grossExitValueKrw)
  };
}
