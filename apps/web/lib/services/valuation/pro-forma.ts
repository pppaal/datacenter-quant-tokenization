import type {
  DebtScheduleResult,
  EquityWaterfallResult,
  LeaseDcfResult,
  ProFormaBaseCase
} from '@/lib/services/valuation/types';
import { computeReturnMetrics } from '@/lib/services/valuation/return-metrics';
import { buildYearMap } from '@/lib/services/valuation/year-map';
import { roundKrw } from '@/lib/services/valuation/utils';

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function buildStoredBaseCaseProForma({
  leaseDcf,
  debtSchedule,
  equityWaterfall,
  totalCapexKrw
}: {
  leaseDcf: LeaseDcfResult;
  debtSchedule: DebtScheduleResult;
  equityWaterfall: EquityWaterfallResult;
  totalCapexKrw: number;
}): ProFormaBaseCase {
  const debtYearsByYear = buildYearMap(debtSchedule.years);
  const equityYearsByYear = buildYearMap(equityWaterfall.years);

  const returnMetrics = computeReturnMetrics({
    leaseDcf,
    debtSchedule,
    equityWaterfall,
    totalCapexKrw
  });

  return {
    summary: {
      annualRevenueKrw: roundKrw(leaseDcf.annualRevenueKrw),
      annualOpexKrw: roundKrw(leaseDcf.annualOpexKrw),
      stabilizedNoiKrw: roundKrw(leaseDcf.stabilizedNoiKrw),
      terminalValueKrw: roundKrw(leaseDcf.terminalValueKrw),
      terminalYear: leaseDcf.terminalYear,
      reserveRequirementKrw: roundKrw(debtSchedule.reserveRequirementKrw),
      endingDebtBalanceKrw: roundKrw(debtSchedule.endingDebtBalanceKrw),
      grossExitValueKrw: roundKrw(equityWaterfall.grossExitValueKrw),
      netExitProceedsKrw: roundKrw(equityWaterfall.netExitProceedsKrw),
      leveredEquityValueKrw: roundKrw(equityWaterfall.leveredEquityValueKrw),
      equityIrr: returnMetrics.equityIrr,
      unleveragedIrr: returnMetrics.unleveragedIrr,
      equityMultiple: returnMetrics.equityMultiple,
      averageCashOnCash: returnMetrics.averageCashOnCash,
      paybackYear: returnMetrics.paybackYear,
      peakEquityExposureKrw: roundKrw(returnMetrics.peakEquityExposureKrw),
      initialEquityKrw: roundKrw(totalCapexKrw - debtSchedule.initialDebtFundingKrw),
      initialDebtFundingKrw: roundKrw(debtSchedule.initialDebtFundingKrw)
    },
    years: leaseDcf.years.map((year) => {
      const debtYear = debtYearsByYear.get(year.year);
      const equityYear = equityYearsByYear.get(year.year);

      return {
        year: year.year,
        occupiedKw: roundKrw(year.occupiedKw),
        contractedKw: roundKrw(year.contractedKw),
        residualOccupiedKw: roundKrw(year.residualOccupiedKw),
        grossPotentialRevenueKrw: roundKrw(year.grossPotentialRevenueKrw),
        contractedRevenueKrw: roundKrw(year.contractedRevenueKrw),
        renewalRevenueKrw: roundKrw(year.renewalRevenueKrw),
        residualRevenueKrw: roundKrw(year.residualRevenueKrw),
        downtimeLossKrw: roundKrw(year.downtimeLossKrw),
        renewalDowntimeLossKrw: roundKrw(year.renewalDowntimeLossKrw),
        rentFreeLossKrw: roundKrw(year.rentFreeLossKrw),
        renewalRentFreeLossKrw: roundKrw(year.renewalRentFreeLossKrw),
        fixedRecoveriesKrw: roundKrw(year.fixedRecoveriesKrw),
        siteRecoveriesKrw: roundKrw(year.siteRecoveriesKrw),
        utilityPassThroughRevenueKrw: roundKrw(year.utilityPassThroughRevenueKrw),
        reimbursementRevenueKrw: roundKrw(year.reimbursementRevenueKrw),
        totalOperatingRevenueKrw: roundKrw(year.totalOperatingRevenueKrw),
        revenueKrw: roundKrw(year.revenueKrw),
        powerCostKrw: roundKrw(year.powerCostKrw),
        siteOperatingExpenseKrw: roundKrw(year.siteOperatingExpenseKrw),
        nonRecoverableOperatingExpenseKrw: roundKrw(year.nonRecoverableOperatingExpenseKrw),
        maintenanceReserveKrw: roundKrw(year.maintenanceReserveKrw),
        operatingExpenseKrw: roundKrw(year.operatingExpenseKrw),
        tenantImprovementKrw: roundKrw(year.tenantImprovementKrw),
        leasingCommissionKrw: roundKrw(year.leasingCommissionKrw),
        tenantCapitalCostKrw: roundKrw(year.tenantCapitalCostKrw),
        renewalTenantCapitalCostKrw: roundKrw(year.renewalTenantCapitalCostKrw),
        fitOutCostKrw: roundKrw(year.fitOutCostKrw),
        noiKrw: roundKrw(year.noiKrw),
        cfadsBeforeDebtKrw: roundKrw(year.cfadsBeforeDebtKrw),
        activeRenewalLeaseCount: year.activeRenewalLeaseCount,
        weightedRenewalRatePerKwKrw:
          year.weightedRenewalRatePerKwKrw !== null &&
          year.weightedRenewalRatePerKwKrw !== undefined
            ? roundKrw(year.weightedRenewalRatePerKwKrw)
            : null,
        drawAmountKrw: roundKrw(debtYear?.drawAmountKrw ?? 0),
        interestKrw: roundKrw(debtYear?.interestKrw ?? 0),
        principalKrw: roundKrw(debtYear?.principalKrw ?? 0),
        debtServiceKrw: roundKrw(debtYear?.debtServiceKrw ?? 0),
        endingDebtBalanceKrw: roundKrw(debtYear?.endingBalanceKrw ?? 0),
        dscr:
          debtYear?.dscr !== null && debtYear?.dscr !== undefined
            ? Number(debtYear.dscr.toFixed(2))
            : null,
        propertyTaxKrw: roundKrw(equityYear?.propertyTaxKrw ?? 0),
        insuranceKrw: roundKrw(equityYear?.insuranceKrw ?? 0),
        managementFeeKrw: roundKrw(equityYear?.managementFeeKrw ?? 0),
        reserveContributionKrw: roundKrw(equityYear?.reserveContributionKrw ?? 0),
        corporateTaxKrw: roundKrw(equityYear?.corporateTaxKrw ?? 0),
        afterTaxDistributionKrw: roundKrw(equityYear?.afterTaxDistributionKrw ?? 0)
      };
    })
  };
}

export function readStoredBaseCaseProForma(assumptions: unknown): ProFormaBaseCase | null {
  const root = asRecord(assumptions);
  const proForma = asRecord(root?.proForma);
  const baseCase = asRecord(proForma?.baseCase);
  const summary = asRecord(baseCase?.summary);
  const years = Array.isArray(baseCase?.years) ? baseCase.years : null;

  if (!summary || !years) return null;

  return {
    summary: summary as ProFormaBaseCase['summary'],
    years: years as ProFormaBaseCase['years']
  };
}

export type StabilizedIncomeView = {
  assetClass: string | null;
  rentableAreaSqm: number | null;
  occupancyPct: number | null;
  monthlyRentPerSqmKrw: number | null;
  grossPotentialRentKrw: number | null;
  effectiveRentalRevenueKrw: number | null;
  otherIncomeKrw: number | null;
  annualOpexKrw: number | null;
  annualCapexReserveKrw: number | null;
  stabilizedNoiKrw: number;
  capRatePct: number;
  purchasePriceKrw: number | null;
  debtLtvPct: number | null;
  debtCostPct: number | null;
  vacancyAllowancePct: number | null;
  comparableEntryCount: number | null;
  marketTransactionCompCount: number | null;
  marketRentCompCount: number | null;
  marketEvidenceCapRatePct: number | null;
};

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export type EngineCrossCheck = {
  engineVersion: string;
  baseCaseValueKrw: number | null;
  confidenceScore: number | null;
  valueDeltaPct: number | null;
};

/**
 * Reads the secondary-engine cross-check the runner records on data-center
 * valuations (canonical value stays TS; this is the independent Python pass and
 * its delta vs the TS base case). Null when no cross-check ran.
 */
export function readEngineCrossCheck(assumptions: unknown): EngineCrossCheck | null {
  const root = asRecord(assumptions);
  const cross = asRecord(root?.engineCrossCheck);
  if (!cross || typeof cross.engineVersion !== 'string') return null;
  return {
    engineVersion: cross.engineVersion,
    baseCaseValueKrw: num(cross.baseCaseValueKrw),
    confidenceScore: num(cross.confidenceScore),
    valueDeltaPct: num(cross.valueDeltaPct)
  };
}

/**
 * Reads the stabilized direct-capitalization assumptions emitted by
 * buildStabilizedIncomeAssumptions (office / retail / industrial / multifamily).
 * Returns null for data centers (which store a full `proForma.baseCase` instead)
 * or when the stabilized fields are absent. Lets the pro-forma surface render a
 * direct-cap view for non-DC asset classes rather than an empty state.
 */
export function readStabilizedIncome(assumptions: unknown): StabilizedIncomeView | null {
  const root = asRecord(assumptions);
  if (!root) return null;
  const stabilizedNoiKrw = num(root.stabilizedNoiKrw);
  const capRatePct = num(root.capRatePct);
  if (stabilizedNoiKrw === null || capRatePct === null || capRatePct <= 0) return null;

  return {
    assetClass: typeof root.assetClass === 'string' ? root.assetClass : null,
    rentableAreaSqm: num(root.rentableAreaSqm),
    occupancyPct: num(root.occupancyPct),
    monthlyRentPerSqmKrw: num(root.monthlyRentPerSqmKrw),
    grossPotentialRentKrw: num(root.grossPotentialRentKrw),
    effectiveRentalRevenueKrw: num(root.effectiveRentalRevenueKrw),
    otherIncomeKrw: num(root.otherIncomeKrw),
    annualOpexKrw: num(root.annualOpexKrw),
    annualCapexReserveKrw: num(root.annualCapexReserveKrw),
    stabilizedNoiKrw,
    capRatePct,
    purchasePriceKrw: num(root.purchasePriceKrw),
    debtLtvPct: num(root.debtLtvPct),
    debtCostPct: num(root.debtCostPct),
    vacancyAllowancePct: num(root.vacancyAllowancePct),
    comparableEntryCount: num(root.comparableEntryCount),
    marketTransactionCompCount: num(root.marketTransactionCompCount),
    marketRentCompCount: num(root.marketRentCompCount),
    marketEvidenceCapRatePct: num(root.marketEvidenceCapRatePct)
  };
}
