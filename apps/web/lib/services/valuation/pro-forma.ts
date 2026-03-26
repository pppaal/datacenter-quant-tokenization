import type {
  DebtScheduleResult,
  EquityWaterfallResult,
  LeaseDcfResult,
  ProFormaBaseCase
} from '@/lib/services/valuation/types';
import { buildYearMap } from '@/lib/services/valuation/year-map';
import { roundKrw } from '@/lib/services/valuation/utils';

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function buildStoredBaseCaseProForma({
  leaseDcf,
  debtSchedule,
  equityWaterfall
}: {
  leaseDcf: LeaseDcfResult;
  debtSchedule: DebtScheduleResult;
  equityWaterfall: EquityWaterfallResult;
}): ProFormaBaseCase {
  const debtYearsByYear = buildYearMap(debtSchedule.years);
  const equityYearsByYear = buildYearMap(equityWaterfall.years);

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
      leveredEquityValueKrw: roundKrw(equityWaterfall.leveredEquityValueKrw)
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
          year.weightedRenewalRatePerKwKrw !== null && year.weightedRenewalRatePerKwKrw !== undefined
            ? roundKrw(year.weightedRenewalRatePerKwKrw)
            : null,
        drawAmountKrw: roundKrw(debtYear?.drawAmountKrw ?? 0),
        interestKrw: roundKrw(debtYear?.interestKrw ?? 0),
        principalKrw: roundKrw(debtYear?.principalKrw ?? 0),
        debtServiceKrw: roundKrw(debtYear?.debtServiceKrw ?? 0),
        endingDebtBalanceKrw: roundKrw(debtYear?.endingBalanceKrw ?? 0),
        dscr: debtYear?.dscr !== null && debtYear?.dscr !== undefined ? Number(debtYear.dscr.toFixed(2)) : null,
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
