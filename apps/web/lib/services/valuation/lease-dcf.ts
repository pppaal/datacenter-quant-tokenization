import type {
  BundleLease,
  BundleLeaseStep,
  LeaseCashFlowYear,
  LeaseDcfResult,
  PreparedUnderwritingInputs,
  ScenarioInput
} from '@/lib/services/valuation/types';
import { clamp, discountValue, ensureNumber } from '@/lib/services/valuation/utils';

type LeaseYearContribution = {
  kw: number;
  revenueKrw: number;
  fitOutCostKrw: number;
  downtimeLossKrw: number;
  rentFreeLossKrw: number;
  fixedRecoveriesKrw: number;
  tenantImprovementKrw: number;
  leasingCommissionKrw: number;
  recoverableOpexShareKw: number;
  utilityPassThroughShareKw: number;
  expenseStopKrw: number;
};

type LeaseYearContext = {
  step: BundleLeaseStep | undefined;
  stepStartYear: number;
  isLeaseStartYear: boolean;
  isStepStartYear: boolean;
  leasedKw: number;
  stepEscalationPct: number;
  probability: number;
  occupancyFactor: number;
};

type LeaseContributionTotals = {
  contractedKw: number;
  contractedRevenueKrw: number;
  fitOutCostKrw: number;
  downtimeLossKrw: number;
  rentFreeLossKrw: number;
  fixedRecoveriesKrw: number;
  tenantImprovementKrw: number;
  leasingCommissionKrw: number;
  contractedRecoverableOpexShareKw: number;
  contractedUtilityPassThroughShareKw: number;
  expenseStopKrw: number;
};

type ResidualRevenueMetrics = {
  residualCapacityKw: number;
  residualOccupancyPct: number;
  residualOccupiedKw: number;
  residualRatePerKwKrw: number;
  residualRevenueKrw: number;
};

type OperatingCostMetrics = {
  occupiedKw: number;
  powerCostKrw: number;
  operatingExpenseKrw: number;
  maintenanceReserveKrw: number;
  siteOperatingExpenseKrw: number;
};

type ReimbursementMetrics = {
  occupiedShare: number;
  residualRecoverableOpexRatio: number;
  siteRecoveriesKrw: number;
  utilityPassThroughRevenueKrw: number;
  reimbursementRevenueKrw: number;
  nonRecoverableOperatingExpenseKrw: number;
};

function probabilityForLease(lease: BundleLease, scenario: ScenarioInput) {
  const base =
    lease.probabilityPct ??
    (lease.status === 'ACTIVE' ? 100 : lease.status === 'SIGNED' ? 88 : 68);
  return clamp((base + scenario.leaseProbabilityBumpPct) / 100, 0.35, 1);
}

function emptyLeaseYearContribution(): LeaseYearContribution {
  return {
    kw: 0,
    revenueKrw: 0,
    fitOutCostKrw: 0,
    downtimeLossKrw: 0,
    rentFreeLossKrw: 0,
    fixedRecoveriesKrw: 0,
    tenantImprovementKrw: 0,
    leasingCommissionKrw: 0,
    recoverableOpexShareKw: 0,
    utilityPassThroughShareKw: 0,
    expenseStopKrw: 0
  };
}

function resolveLeaseYearContext(
  lease: BundleLease,
  year: number,
  annualGrowthPct: number,
  scenario: ScenarioInput
): LeaseYearContext | null {
  const endYear = lease.startYear + lease.termYears - 1;
  if (year < lease.startYear || year > endYear) return null;

  const step = lease.steps.find((candidate) => year >= candidate.startYear && year <= candidate.endYear);
  const stepStartYear = step?.startYear ?? lease.startYear;
  const leasedKw = ensureNumber(step?.leasedKw, lease.leasedKw);
  const stepEscalationPct = ensureNumber(
    step?.annualEscalationPct,
    lease.annualEscalationPct ?? annualGrowthPct
  );
  const isLeaseStartYear = year === lease.startYear;
  const isStepStartYear = year === stepStartYear;
  const probability = probabilityForLease(lease, scenario);
  const occupancyFactor = clamp(ensureNumber(step?.occupancyPct, 100) / 100, 0.25, 1);

  return {
    step,
    stepStartYear,
    isLeaseStartYear,
    isStepStartYear,
    leasedKw,
    stepEscalationPct,
    probability,
    occupancyFactor
  };
}

function resolveLeaseRatePerKwKrw(lease: BundleLease, context: LeaseYearContext, year: number) {
  const baseRatePerKwKrw = ensureNumber(context.step?.ratePerKwKrw, lease.baseRatePerKwKrw);
  return baseRatePerKwKrw * (1 + context.stepEscalationPct / 100) ** Math.max(year - context.stepStartYear, 0);
}

function resolveTenantCapitalCosts(
  lease: BundleLease,
  context: LeaseYearContext
) {
  const legacyFitOutCostKrw = context.isLeaseStartYear ? ensureNumber(lease.fitOutCostKrw, 0) : 0;
  const tenantImprovementFallbackKrw = legacyFitOutCostKrw * 0.82;
  const leasingCommissionFallbackKrw = Math.max(legacyFitOutCostKrw - tenantImprovementFallbackKrw, 0);
  const leaseLevelTenantImprovementKrw = ensureNumber(
    lease.tenantImprovementKrw,
    lease.leasingCommissionKrw !== null && lease.leasingCommissionKrw !== undefined
      ? Math.max(legacyFitOutCostKrw - ensureNumber(lease.leasingCommissionKrw, 0), 0)
      : tenantImprovementFallbackKrw
  );
  const leaseLevelLeasingCommissionKrw = ensureNumber(
    lease.leasingCommissionKrw,
    lease.tenantImprovementKrw !== null && lease.tenantImprovementKrw !== undefined
      ? Math.max(legacyFitOutCostKrw - ensureNumber(lease.tenantImprovementKrw, 0), 0)
      : leasingCommissionFallbackKrw
  );
  const tenantImprovementKrw =
    context.isStepStartYear
      ? context.step?.tenantImprovementKrw !== null && context.step?.tenantImprovementKrw !== undefined
        ? ensureNumber(context.step.tenantImprovementKrw, 0)
        : context.isLeaseStartYear
          ? leaseLevelTenantImprovementKrw
          : 0
      : 0;
  const leasingCommissionKrw =
    context.isStepStartYear
      ? context.step?.leasingCommissionKrw !== null && context.step?.leasingCommissionKrw !== undefined
        ? ensureNumber(context.step.leasingCommissionKrw, 0)
        : context.isLeaseStartYear
          ? leaseLevelLeasingCommissionKrw
          : 0
      : 0;

  return {
    tenantImprovementKrw,
    leasingCommissionKrw,
    fitOutCostKrw: tenantImprovementKrw + leasingCommissionKrw
  };
}

function leaseRevenueForYear(
  lease: BundleLease,
  year: number,
  annualGrowthPct: number,
  scenario: ScenarioInput
) {
  const context = resolveLeaseYearContext(lease, year, annualGrowthPct, scenario);
  if (!context) return emptyLeaseYearContribution();

  const ratePerKwKrw = resolveLeaseRatePerKwKrw(lease, context, year);
  const { tenantImprovementKrw, leasingCommissionKrw, fitOutCostKrw } = resolveTenantCapitalCosts(
    lease,
    context
  );
  const monthlyRevenueKrw =
    context.leasedKw * ratePerKwKrw * context.probability * context.occupancyFactor * scenario.revenueFactor;
  const downtimeMonths = year === lease.startYear ? clamp(ensureNumber(lease.downtimeMonths, 0), 0, 11) : 0;
  const rentFreeMonths =
    context.isStepStartYear
      ? clamp(ensureNumber(context.step?.rentFreeMonths, lease.rentFreeMonths ?? 0), 0, 11 - downtimeMonths)
      : 0;
  const downtimeLossKrw = monthlyRevenueKrw * downtimeMonths;
  const rentFreeLossKrw = monthlyRevenueKrw * rentFreeMonths;
  const recoverableOpexRatio = clamp(
    ensureNumber(context.step?.recoverableOpexRatioPct, lease.recoverableOpexRatioPct ?? 35) / 100,
    0,
    1
  );
  const fixedRecoveriesBaseKrw = ensureNumber(context.step?.fixedRecoveriesKrw, lease.fixedRecoveriesKrw ?? 0);
  const fixedRecoveriesKrw =
    fixedRecoveriesBaseKrw *
    (1 + context.stepEscalationPct / 100) ** Math.max(year - context.stepStartYear, 0) *
    context.probability *
    context.occupancyFactor *
    scenario.revenueFactor;
  const utilityPassThroughRatio = clamp(
    ensureNumber(context.step?.utilityPassThroughPct, lease.utilityPassThroughPct ?? 0) / 100,
    0,
    1
  );
  const operatingMonths = Math.max(12 - downtimeMonths, 0);
  const expenseStopKrw =
    ensureNumber(context.step?.expenseStopKrwPerKwMonth, lease.expenseStopKrwPerKwMonth ?? 0) *
    context.leasedKw *
    context.probability *
    context.occupancyFactor *
    operatingMonths;
  const effectiveKw = context.leasedKw * context.probability * context.occupancyFactor;

  return {
    kw: effectiveKw,
    revenueKrw: monthlyRevenueKrw * Math.max(12 - downtimeMonths - rentFreeMonths, 0),
    fitOutCostKrw,
    downtimeLossKrw,
    rentFreeLossKrw,
    fixedRecoveriesKrw,
    tenantImprovementKrw,
    leasingCommissionKrw,
    recoverableOpexShareKw: effectiveKw * recoverableOpexRatio,
    utilityPassThroughShareKw: effectiveKw * utilityPassThroughRatio,
    expenseStopKrw
  };
}

function aggregateLeaseContributions(
  leases: BundleLease[],
  year: number,
  annualGrowthPct: number,
  scenario: ScenarioInput
): LeaseContributionTotals {
  return leases.reduce<LeaseContributionTotals>(
    (totals, lease) => {
      const contribution = leaseRevenueForYear(lease, year, annualGrowthPct, scenario);

      totals.contractedKw += contribution.kw;
      totals.contractedRevenueKrw += contribution.revenueKrw;
      totals.fitOutCostKrw += contribution.fitOutCostKrw;
      totals.downtimeLossKrw += contribution.downtimeLossKrw;
      totals.rentFreeLossKrw += contribution.rentFreeLossKrw;
      totals.fixedRecoveriesKrw += contribution.fixedRecoveriesKrw;
      totals.tenantImprovementKrw += contribution.tenantImprovementKrw;
      totals.leasingCommissionKrw += contribution.leasingCommissionKrw;
      totals.contractedRecoverableOpexShareKw += contribution.recoverableOpexShareKw;
      totals.contractedUtilityPassThroughShareKw += contribution.utilityPassThroughShareKw;
      totals.expenseStopKrw += contribution.expenseStopKrw;

      return totals;
    },
    {
      contractedKw: 0,
      contractedRevenueKrw: 0,
      fitOutCostKrw: 0,
      downtimeLossKrw: 0,
      rentFreeLossKrw: 0,
      fixedRecoveriesKrw: 0,
      tenantImprovementKrw: 0,
      leasingCommissionKrw: 0,
      contractedRecoverableOpexShareKw: 0,
      contractedUtilityPassThroughShareKw: 0,
      expenseStopKrw: 0
    }
  );
}

function computeResidualRevenueMetrics(
  prepared: PreparedUnderwritingInputs,
  scenario: ScenarioInput,
  year: number,
  baseResidualRampPct: number,
  contractedKw: number
): ResidualRevenueMetrics {
  const residualCapacityKw = Math.max(prepared.capacityKw - contractedKw, 0);
  const residualOccupancyPct = clamp(
    Math.min(prepared.occupancyPct, baseResidualRampPct + year * 6) * scenario.revenueFactor,
    10,
    98
  );
  const residualOccupiedKw = residualCapacityKw * (residualOccupancyPct / 100);
  const residualRatePerKwKrw =
    prepared.baseMonthlyRatePerKwKrw *
    0.93 *
    (1 + prepared.annualGrowthPct / 100) ** (year - 1) *
    scenario.revenueFactor;

  return {
    residualCapacityKw,
    residualOccupancyPct,
    residualOccupiedKw,
    residualRatePerKwKrw,
    residualRevenueKrw: residualOccupiedKw * residualRatePerKwKrw * 12
  };
}

function computeOperatingCostMetrics(
  prepared: PreparedUnderwritingInputs,
  scenario: ScenarioInput,
  year: number,
  contractedKw: number,
  residualOccupiedKw: number
): OperatingCostMetrics {
  const occupiedKw = contractedKw + residualOccupiedKw;
  const powerCostKrw =
    Math.max(occupiedKw, prepared.capacityKw * 0.18) *
    24 *
    365 *
    0.72 *
    prepared.pueTarget *
    prepared.powerPriceKrwPerKwh *
    scenario.costFactor;
  const operatingExpenseKrw =
    prepared.baseOpexKrw *
    (1 + (prepared.annualGrowthPct * 0.75) / 100) ** (year - 1) *
    scenario.costFactor;
  const maintenanceReserveKrw = operatingExpenseKrw * 0.18;

  return {
    occupiedKw,
    powerCostKrw,
    operatingExpenseKrw,
    maintenanceReserveKrw,
    siteOperatingExpenseKrw: operatingExpenseKrw - maintenanceReserveKrw
  };
}

function computeReimbursementMetrics(
  prepared: PreparedUnderwritingInputs,
  contractedRecoverableOpexShareKw: number,
  contractedUtilityPassThroughShareKw: number,
  residualOccupiedKw: number,
  occupiedKw: number,
  siteOperatingExpenseKrw: number,
  powerCostKrw: number,
  fixedRecoveriesKrw: number,
  expenseStopKrw: number
): ReimbursementMetrics {
  const occupiedShare = clamp(occupiedKw / Math.max(prepared.capacityKw, 1), 0, 1);
  const residualRecoverableOpexRatio = clamp(0.18 + occupiedShare * 0.22, 0.12, 0.42);
  const siteRecoveriesKrw =
    occupiedKw > 0
      ? Math.max(
          siteOperatingExpenseKrw *
            clamp(
              (contractedRecoverableOpexShareKw + residualOccupiedKw * residualRecoverableOpexRatio) / occupiedKw,
              0,
              1
            ) -
            expenseStopKrw,
          0
        )
      : 0;
  const utilityPassThroughRevenueKrw =
    occupiedKw > 0
      ? powerCostKrw *
        clamp((contractedUtilityPassThroughShareKw + residualOccupiedKw * 0.14) / occupiedKw, 0, 1)
      : 0;
  const reimbursementRevenueKrw = fixedRecoveriesKrw + siteRecoveriesKrw + utilityPassThroughRevenueKrw;

  return {
    occupiedShare,
    residualRecoverableOpexRatio,
    siteRecoveriesKrw,
    utilityPassThroughRevenueKrw,
    reimbursementRevenueKrw,
    nonRecoverableOperatingExpenseKrw: Math.max(siteOperatingExpenseKrw - siteRecoveriesKrw, 0)
  };
}

function buildLeaseCashFlowYear(
  year: number,
  totals: LeaseContributionTotals,
  residual: ResidualRevenueMetrics,
  operating: OperatingCostMetrics,
  reimbursements: ReimbursementMetrics
): LeaseCashFlowYear {
  const revenueKrw = totals.contractedRevenueKrw + residual.residualRevenueKrw;
  const totalOperatingRevenueKrw = revenueKrw + reimbursements.reimbursementRevenueKrw;
  const tenantCapitalCostKrw = totals.tenantImprovementKrw + totals.leasingCommissionKrw;
  const grossPotentialRevenueKrw = revenueKrw + totals.downtimeLossKrw + totals.rentFreeLossKrw;
  const noiKrw = Math.max(
    totalOperatingRevenueKrw - operating.powerCostKrw - operating.siteOperatingExpenseKrw - operating.maintenanceReserveKrw,
    0
  );

  return {
    year,
    occupiedKw: operating.occupiedKw,
    contractedKw: totals.contractedKw,
    residualOccupiedKw: residual.residualOccupiedKw,
    grossPotentialRevenueKrw,
    contractedRevenueKrw: totals.contractedRevenueKrw,
    residualRevenueKrw: residual.residualRevenueKrw,
    downtimeLossKrw: totals.downtimeLossKrw,
    rentFreeLossKrw: totals.rentFreeLossKrw,
    fixedRecoveriesKrw: totals.fixedRecoveriesKrw,
    siteRecoveriesKrw: reimbursements.siteRecoveriesKrw,
    utilityPassThroughRevenueKrw: reimbursements.utilityPassThroughRevenueKrw,
    reimbursementRevenueKrw: reimbursements.reimbursementRevenueKrw,
    totalOperatingRevenueKrw,
    revenueKrw,
    powerCostKrw: operating.powerCostKrw,
    siteOperatingExpenseKrw: operating.siteOperatingExpenseKrw,
    nonRecoverableOperatingExpenseKrw: reimbursements.nonRecoverableOperatingExpenseKrw,
    maintenanceReserveKrw: operating.maintenanceReserveKrw,
    operatingExpenseKrw: operating.operatingExpenseKrw,
    tenantImprovementKrw: totals.tenantImprovementKrw,
    leasingCommissionKrw: totals.leasingCommissionKrw,
    tenantCapitalCostKrw,
    fitOutCostKrw: totals.fitOutCostKrw,
    noiKrw,
    cfadsBeforeDebtKrw: Math.max(noiKrw - tenantCapitalCostKrw, 0)
  };
}

export function computeLeaseDcf(
  prepared: PreparedUnderwritingInputs,
  scenario: ScenarioInput
): LeaseDcfResult {
  const horizonYears = 10;
  const annualGrowthPct = prepared.annualGrowthPct;
  const exitCapRatePct = Math.max(prepared.baseCapRatePct + scenario.capRateShiftPct, 4.5);
  const discountRatePct = Math.max(prepared.baseDiscountRatePct + scenario.discountRateShiftPct, 7.5);
  const baseResidualRampPct = Math.max(prepared.occupancyPct * 0.45, 28);
  const years: LeaseCashFlowYear[] = [];

  for (let year = 1; year <= horizonYears; year += 1) {
    const totals = aggregateLeaseContributions(prepared.leases, year, annualGrowthPct, scenario);
    const residual = computeResidualRevenueMetrics(
      prepared,
      scenario,
      year,
      baseResidualRampPct,
      totals.contractedKw
    );
    const operating = computeOperatingCostMetrics(
      prepared,
      scenario,
      year,
      totals.contractedKw,
      residual.residualOccupiedKw
    );
    const reimbursements = computeReimbursementMetrics(
      prepared,
      totals.contractedRecoverableOpexShareKw,
      totals.contractedUtilityPassThroughShareKw,
      residual.residualOccupiedKw,
      operating.occupiedKw,
      operating.siteOperatingExpenseKrw,
      operating.powerCostKrw,
      totals.fixedRecoveriesKrw,
      totals.expenseStopKrw
    );

    years.push(buildLeaseCashFlowYear(year, totals, residual, operating, reimbursements));
  }

  const stabilizedYears = years.slice(-5);
  const stabilizedNoiKrw =
    stabilizedYears.reduce((sum, year) => sum + year.noiKrw, 0) / Math.max(stabilizedYears.length, 1);
  const incomeApproachValueKrw =
    (stabilizedNoiKrw / (exitCapRatePct / 100)) *
    prepared.stageFactor *
    prepared.permitPenalty *
    prepared.floodPenalty *
    prepared.wildfirePenalty *
    prepared.locationPremium;
  const discountedCashflowsKrw = years.reduce(
    (sum, year) => sum + discountValue(year.cfadsBeforeDebtKrw, discountRatePct, year.year),
    0
  );
  const terminalValueKrw =
    (Math.max(stabilizedNoiKrw * (1 + annualGrowthPct / 100), prepared.capexBreakdown.totalCapexKrw * 0.01) /
      (Math.max(exitCapRatePct + 0.2, 4.8) / 100)) *
    prepared.stageFactor *
    prepared.permitPenalty *
    prepared.floodPenalty *
    prepared.wildfirePenalty *
    prepared.locationPremium;
  const leaseDrivenValueKrw =
    discountedCashflowsKrw + discountValue(terminalValueKrw, discountRatePct, horizonYears);

  return {
    years,
    annualRevenueKrw: years[0]?.totalOperatingRevenueKrw ?? 0,
    annualOpexKrw: (years[0]?.powerCostKrw ?? 0) + (years[0]?.operatingExpenseKrw ?? 0),
    stabilizedNoiKrw,
    incomeApproachValueKrw,
    leaseDrivenValueKrw,
    terminalValueKrw
  };
}
