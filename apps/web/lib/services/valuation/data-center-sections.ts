import { computeCostApproach } from '@/lib/services/valuation/cost-approach';
import { computeEquityWaterfall } from '@/lib/services/valuation/equity-waterfall';
import { computeLeaseDcf } from '@/lib/services/valuation/lease-dcf';
import { buildStoredBaseCaseProForma } from '@/lib/services/valuation/pro-forma';
import { buildDebtSchedule } from '@/lib/services/valuation/project-finance';
import type {
  PreparedUnderwritingInputs,
  ScenarioInput,
  UnderwritingAnalysis,
  UnderwritingScenario
} from '@/lib/services/valuation/types';
import { clamp, roundKrw } from '@/lib/services/valuation/utils';
import type { ProvenanceEntry } from '@/lib/sources/types';

export type DataCenterScenarioEvaluation = {
  scenario: UnderwritingScenario;
  weightedValueKrw: number;
  costApproach: ReturnType<typeof computeCostApproach>;
  leaseDcf: ReturnType<typeof computeLeaseDcf>;
  debtSchedule: ReturnType<typeof buildDebtSchedule>;
  equityWaterfall: ReturnType<typeof computeEquityWaterfall>;
};

export function buildDataCenterConfidenceScore(prepared: PreparedUnderwritingInputs) {
  const externalSections = [
    prepared.bundle.siteProfile,
    prepared.bundle.buildingSnapshot,
    prepared.bundle.permitSnapshot,
    prepared.bundle.energySnapshot,
    prepared.bundle.marketSnapshot
  ].filter(Boolean).length;

  const structuredSections = [
    prepared.comparableCalibration.entryCount > 0,
    prepared.capexBreakdown.totalCapexKrw > 0,
    prepared.leases.length > 0,
    Boolean(prepared.bundle.taxAssumption),
    Boolean(prepared.bundle.spvStructure),
    prepared.debtFacilities.length > 0
  ].filter(Boolean).length;

  const microCoverage = [
    prepared.curatedFeatureOverrides.powerMicro.sourceVersion,
    prepared.curatedFeatureOverrides.revenueMicro.sourceVersion,
    prepared.curatedFeatureOverrides.legalMicro.sourceVersion
  ].filter(Boolean).length;

  const legalSeverity = prepared.curatedFeatureOverrides.legalMicro.constraintSeverity?.toLowerCase() ?? '';
  const legalPenalty = legalSeverity.includes('high') || legalSeverity.includes('severe') ? 0.35 : 0;
  const encumbrancePenalty =
    typeof prepared.curatedFeatureOverrides.legalMicro.priorityRank === 'number' &&
    prepared.curatedFeatureOverrides.legalMicro.priorityRank <= 1
      ? 0.2
      : 0;
  const revenuePenalty =
    typeof prepared.curatedFeatureOverrides.revenueMicro.probabilityPct === 'number' &&
    prepared.curatedFeatureOverrides.revenueMicro.probabilityPct < 75
      ? 0.2
      : 0;
  const powerPenalty =
    typeof prepared.curatedFeatureOverrides.powerMicro.substationDistanceKm === 'number' &&
    prepared.curatedFeatureOverrides.powerMicro.substationDistanceKm > 3
      ? 0.15
      : 0;

  return Number(
    clamp(
      4.3 +
        externalSections * 0.65 +
        structuredSections * 0.45 +
        microCoverage * 0.25 +
        (prepared.bundle.address?.latitude ? 0.25 : 0) -
        (prepared.bundle.siteProfile?.floodRiskScore ?? 0) * 0.05 -
        (prepared.bundle.siteProfile?.wildfireRiskScore ?? 0) * 0.04 -
        legalPenalty -
        encumbrancePenalty -
        revenuePenalty -
        powerPenalty,
      4.5,
      9.9
    ).toFixed(1)
  );
}

export function buildDataCenterKeyRisks(
  prepared: PreparedUnderwritingInputs,
  base: DataCenterScenarioEvaluation
) {
  const legalMicro = prepared.curatedFeatureOverrides.legalMicro;
  const revenueMicro = prepared.curatedFeatureOverrides.revenueMicro;
  const powerMicro = prepared.curatedFeatureOverrides.powerMicro;

  const legalRisk =
    legalMicro.constraintTitle || legalMicro.encumbranceType
      ? `${legalMicro.constraintTitle ?? legalMicro.encumbranceType} remains a legal diligence item and should be cleared against title, covenant, and closing mechanics.`
      : 'Title, encumbrance, and planning constraint diligence still need to be tied to executable closing conditions.';
  const leasingRisk =
    typeof revenueMicro.probabilityPct === 'number' && revenueMicro.probabilityPct < 80
      ? `${revenueMicro.primaryTenant ?? 'Primary tenant'} underwriting still reflects only ${revenueMicro.probabilityPct.toFixed(0)}% lease probability, so revenue certainty remains below investment-grade execution.`
      : prepared.leases.length > 0
        ? 'Tenant-by-tenant ramp assumptions still require signed-paper verification.'
        : 'Lease-by-lease cash flow is synthetic until tenant schedules are entered.';
  const powerRisk =
    typeof powerMicro.substationDistanceKm === 'number' && powerMicro.substationDistanceKm > 3
      ? `Utility interconnection still depends on a ${powerMicro.substationDistanceKm.toFixed(1)} km substation connection, which can widen timing and cost risk.`
      : powerMicro.utilityName
        ? `${powerMicro.utilityName} utility allocation and resiliency assumptions still need to be confirmed against executed service terms.`
        : prepared.bundle.permitSnapshot?.powerApprovalStatus ||
          'Utility allocation timing remains unconfirmed for the underwriting case.';

  return [
    powerRisk,
    leasingRisk,
    prepared.comparableCalibration.entryCount > 0
      ? 'Comparable calibration needs periodic refresh as cap-rate and pricing comps move.'
      : 'No stored comparable set yet; market calibration still leans on benchmark assumptions.',
    legalRisk,
    prepared.debtFacilities.length > 0
      ? 'Debt sculpting and reserve sizing should be reconciled with lender term sheets.'
      : 'Project finance stack is still synthetic and should be replaced by lender-specific terms.',
    base.equityWaterfall.grossExitValueKrw > base.weightedValueKrw
      ? 'Exit proceeds are meaningful to equity value, so terminal assumptions remain a major sensitivity.'
      : 'Current value still depends heavily on downside floor protection rather than terminal upside.',
    prepared.bundle.siteProfile?.wildfireRiskScore && prepared.bundle.siteProfile.wildfireRiskScore >= 2
      ? 'Satellite fire-screening shows elevated nearby hotspot activity and should be checked against infrastructure buffers.'
      : 'Current wildfire-screening signals do not indicate persistent nearby hotspot pressure.'
  ].slice(0, 5);
}

export function buildDataCenterDdChecklist(prepared: PreparedUnderwritingInputs) {
  const powerMicro = prepared.curatedFeatureOverrides.powerMicro;
  const legalMicro = prepared.curatedFeatureOverrides.legalMicro;
  const revenueMicro = prepared.curatedFeatureOverrides.revenueMicro;

  return [
    'Refresh the comparable matrix with at least three recent Korea or regional data-center references.',
    'Split capex into land, shell/core, electrical, mechanical, IT fit-out, and soft-cost packages.',
    powerMicro.utilityName || powerMicro.substationDistanceKm !== null
      ? 'Reconcile utility quote, substation routing, backup-fuel coverage, and PUE assumptions against the current power package.'
      : 'Load a current utility package covering substation routing, tariff, backup fuel, and design PUE assumptions.',
    revenueMicro.primaryTenant || revenueMicro.probabilityPct !== null
      ? 'Tie the primary lease case to executed paper, credit approval, and downtime/renewal assumptions.'
      : 'Load tenant-by-tenant lease schedules including ramp, escalators, fit-out, and renewal assumptions.',
    legalMicro.ownerName || legalMicro.constraintTitle || legalMicro.encumbranceType
      ? 'Tie title, encumbrance, and planning constraints to closing conditions, covenant compliance, and consent requirements.'
      : 'Tie tax leakage, SPV fees, and reserve accounts to the legal structure approved for the deal.',
    'Replace synthetic debt sizing with lender term-sheet draws, grace periods, sculpting targets, and balloon terms.'
  ];
}

export function buildDataCenterAssumptions(
  prepared: PreparedUnderwritingInputs,
  evaluations: DataCenterScenarioEvaluation[],
  buildApproachMix: (evaluation: DataCenterScenarioEvaluation) => Record<string, number>
) {
  const base = evaluations.find((evaluation) => evaluation.scenario.name === 'Base') ?? evaluations[0];
  const approachMix = buildApproachMix(base);

  return {
    metrics: {
      capacityMw: prepared.capacityMw,
      occupancyPct: prepared.occupancyPct,
      monthlyRatePerKwKrw: prepared.baseMonthlyRatePerKwKrw,
      capRatePct: prepared.baseCapRatePct,
      discountRatePct: prepared.baseDiscountRatePct,
      debtCostPct: prepared.baseDebtCostPct,
      powerPriceKrwPerKwh: prepared.powerPriceKrwPerKwh,
      pueTarget: prepared.pueTarget,
      stageFactor: prepared.stageFactor,
      permitPenalty: prepared.permitPenalty,
      floodPenalty: prepared.floodPenalty,
      wildfirePenalty: prepared.wildfirePenalty,
      locationPremium: prepared.locationPremium
    },
    comparables: {
      setName: prepared.bundle.comparableSet?.name ?? null,
      entryCount: prepared.comparableCalibration.entryCount,
      weightedCapRatePct: prepared.comparableCalibration.weightedCapRatePct,
      weightedMonthlyRatePerKwKrw: prepared.comparableCalibration.weightedMonthlyRatePerKwKrw,
      weightedDiscountRatePct: prepared.comparableCalibration.weightedDiscountRatePct,
      directComparableValueKrw: prepared.comparableCalibration.directComparableValueKrw
    },
    capex: prepared.capexBreakdown,
    leasing: {
      leaseCount: prepared.leases.length,
      contractedKw: roundKrw(
        prepared.leases.reduce((sum, lease) => sum + lease.leasedKw * ((lease.probabilityPct ?? 100) / 100), 0)
      ),
      baseYearRevenueKrw: roundKrw(base.leaseDcf.annualRevenueKrw),
      stabilizedNoiKrw: roundKrw(base.leaseDcf.stabilizedNoiKrw)
    },
    taxes: prepared.taxProfile,
    spv: prepared.spvProfile,
    debt: {
      facilityCount: prepared.debtFacilities.length || 1,
      initialDebtFundingKrw: roundKrw(base.debtSchedule.initialDebtFundingKrw),
      weightedInterestRatePct: Number(base.debtSchedule.weightedInterestRatePct.toFixed(2)),
      reserveRequirementKrw: roundKrw(base.debtSchedule.reserveRequirementKrw),
      endingDebtBalanceKrw: roundKrw(base.debtSchedule.endingDebtBalanceKrw)
    },
    macroRegime: prepared.macroRegime,
    documentFeatures: {
      sourceVersion: prepared.documentFeatureOverrides.sourceVersion,
      occupancyPct: prepared.documentFeatureOverrides.occupancyPct,
      monthlyRatePerKwKrw: prepared.documentFeatureOverrides.monthlyRatePerKwKrw,
      capRatePct: prepared.documentFeatureOverrides.capRatePct,
      discountRatePct: prepared.documentFeatureOverrides.discountRatePct,
      capexKrw: prepared.documentFeatureOverrides.capexKrw,
      contractedKw: prepared.documentFeatureOverrides.contractedKw,
      permitStatusNote: prepared.documentFeatureOverrides.permitStatusNote
    },
    curatedFeatures: {
      marketInputs: prepared.curatedFeatureOverrides.marketInputs,
      satelliteRisk: prepared.curatedFeatureOverrides.satelliteRisk,
      permitInputs: prepared.curatedFeatureOverrides.permitInputs,
      powerMicro: prepared.curatedFeatureOverrides.powerMicro,
      revenueMicro: prepared.curatedFeatureOverrides.revenueMicro,
      legalMicro: prepared.curatedFeatureOverrides.legalMicro,
      reviewReadiness: prepared.curatedFeatureOverrides.reviewReadiness
    },
    satelliteRisk: {
      floodRiskScore:
        prepared.curatedFeatureOverrides.satelliteRisk.floodRiskScore ?? prepared.bundle.siteProfile?.floodRiskScore ?? null,
      wildfireRiskScore:
        prepared.curatedFeatureOverrides.satelliteRisk.wildfireRiskScore ??
        prepared.bundle.siteProfile?.wildfireRiskScore ??
        null,
      climateNote:
        prepared.curatedFeatureOverrides.satelliteRisk.climateNote ?? prepared.bundle.siteProfile?.siteNotes ?? null
    },
    approaches: {
      ...approachMix,
      leaseDcfTerminalValueKrw: roundKrw(base.leaseDcf.terminalValueKrw),
      leveredEquityValueKrw: roundKrw(base.equityWaterfall.leveredEquityValueKrw),
      enterpriseEquivalentValueKrw: roundKrw(base.equityWaterfall.enterpriseEquivalentValueKrw),
      grossExitValueKrw: roundKrw(base.equityWaterfall.grossExitValueKrw)
    },
    proForma: {
      baseCase: buildStoredBaseCaseProForma({
        leaseDcf: base.leaseDcf,
        debtSchedule: base.debtSchedule,
        equityWaterfall: base.equityWaterfall
      })
    }
  };
}

export function buildDataCenterProvenance(prepared: PreparedUnderwritingInputs): ProvenanceEntry[] {
  const fetchedAt = new Date().toISOString();

  return [
    {
      field: 'address',
      value: prepared.bundle.address ? `${prepared.bundle.address.line1}, ${prepared.bundle.address.city}` : null,
      sourceSystem: 'manual-intake',
      mode: 'manual',
      fetchedAt,
      freshnessLabel: prepared.bundle.address?.sourceLabel || 'manual intake'
    },
    {
      field: 'capRatePct',
      value: prepared.baseCapRatePct,
      sourceSystem: prepared.comparableCalibration.entryCount > 0 ? 'comparable-calibration' : 'korea-macro-rates',
      mode: prepared.comparableCalibration.entryCount > 0 ? 'manual' : 'fallback',
      fetchedAt: prepared.bundle.marketSnapshot?.sourceUpdatedAt?.toISOString() ?? fetchedAt,
      freshnessLabel:
        prepared.comparableCalibration.entryCount > 0
          ? `${prepared.comparableCalibration.entryCount} comp entries`
          : prepared.bundle.marketSnapshot?.sourceStatus.toLowerCase() ?? 'fallback dataset'
    },
    {
      field: 'wildfireRiskScore',
      value: prepared.bundle.siteProfile?.wildfireRiskScore ?? null,
      sourceSystem: 'nasa-firms',
      mode: prepared.bundle.siteProfile?.wildfireRiskScore ? 'api' : 'fallback',
      fetchedAt,
      freshnessLabel: prepared.bundle.siteProfile?.wildfireRiskScore ? 'satellite hotspot overlay' : 'fallback dataset'
    },
    {
      field: 'capexBreakdown',
      value: prepared.capexBreakdown.totalCapexKrw,
      sourceSystem: prepared.bundle.capexLineItems?.length ? 'capex-line-items' : 'manual-capex-assumption',
      mode: 'manual',
      fetchedAt,
      freshnessLabel: prepared.bundle.capexLineItems?.length ? 'line-item cost model' : 'fallback allocation'
    },
    {
      field: 'leaseCount',
      value: prepared.leases.length,
      sourceSystem: prepared.leases.length > 0 ? 'lease-schedule' : 'synthetic-lease-up',
      mode: 'manual',
      fetchedAt,
      freshnessLabel: prepared.leases.length > 0 ? 'lease-by-lease' : 'synthetic ramp'
    },
    {
      field: 'debtFacilities',
      value: prepared.debtFacilities.length || 1,
      sourceSystem: prepared.debtFacilities.length > 0 ? 'debt-term-sheet' : 'synthetic-project-finance',
      mode: 'manual',
      fetchedAt,
      freshnessLabel: prepared.debtFacilities.length > 0 ? 'term-sheet inputs' : 'synthetic facility'
    },
    {
      field: 'documentFeatureSnapshot',
      value: prepared.documentFeatureOverrides.sourceVersion,
      sourceSystem: 'document_feature_snapshot',
      mode: prepared.documentFeatureOverrides.sourceVersion ? 'manual' : 'fallback',
      fetchedAt,
      freshnessLabel: prepared.documentFeatureOverrides.sourceVersion ?? 'not applied'
    },
    {
      field: 'marketFeatureSnapshot',
      value: prepared.curatedFeatureOverrides.marketInputs.sourceVersion,
      sourceSystem: 'market_feature_snapshot',
      mode: prepared.curatedFeatureOverrides.marketInputs.sourceVersion ? 'manual' : 'fallback',
      fetchedAt,
      freshnessLabel: prepared.curatedFeatureOverrides.marketInputs.sourceVersion ?? 'not applied'
    },
    {
      field: 'satelliteFeatureSnapshot',
      value: prepared.curatedFeatureOverrides.satelliteRisk.sourceVersion,
      sourceSystem: 'satellite_feature_snapshot',
      mode: prepared.curatedFeatureOverrides.satelliteRisk.sourceVersion ? 'manual' : 'fallback',
      fetchedAt,
      freshnessLabel: prepared.curatedFeatureOverrides.satelliteRisk.sourceVersion ?? 'not applied'
    },
    {
      field: 'permitFeatureSnapshot',
      value: prepared.curatedFeatureOverrides.permitInputs.sourceVersion,
      sourceSystem: 'permit_feature_snapshot',
      mode: prepared.curatedFeatureOverrides.permitInputs.sourceVersion ? 'manual' : 'fallback',
      fetchedAt,
      freshnessLabel: prepared.curatedFeatureOverrides.permitInputs.sourceVersion ?? 'not applied'
    },
    {
      field: 'powerFeatureSnapshot',
      value: prepared.curatedFeatureOverrides.powerMicro.sourceVersion,
      sourceSystem: 'power_feature_snapshot',
      mode: prepared.curatedFeatureOverrides.powerMicro.sourceVersion ? 'manual' : 'fallback',
      fetchedAt,
      freshnessLabel: prepared.curatedFeatureOverrides.powerMicro.sourceVersion ?? 'not applied'
    },
    {
      field: 'revenueFeatureSnapshot',
      value: prepared.curatedFeatureOverrides.revenueMicro.sourceVersion,
      sourceSystem: 'revenue_feature_snapshot',
      mode: prepared.curatedFeatureOverrides.revenueMicro.sourceVersion ? 'manual' : 'fallback',
      fetchedAt,
      freshnessLabel: prepared.curatedFeatureOverrides.revenueMicro.sourceVersion ?? 'not applied'
    },
    {
      field: 'legalFeatureSnapshot',
      value: prepared.curatedFeatureOverrides.legalMicro.sourceVersion,
      sourceSystem: 'legal_feature_snapshot',
      mode: prepared.curatedFeatureOverrides.legalMicro.sourceVersion ? 'manual' : 'fallback',
      fetchedAt,
      freshnessLabel: prepared.curatedFeatureOverrides.legalMicro.sourceVersion ?? 'not applied'
    },
    {
      field: 'readinessFeatureSnapshot',
      value: prepared.curatedFeatureOverrides.reviewReadiness.sourceVersion,
      sourceSystem: 'readiness_feature_snapshot',
      mode: prepared.curatedFeatureOverrides.reviewReadiness.sourceVersion ? 'manual' : 'fallback',
      fetchedAt,
      freshnessLabel: prepared.curatedFeatureOverrides.reviewReadiness.sourceVersion ?? 'not applied'
    },
    {
      field: 'macro.guidance',
      value: JSON.stringify(prepared.macroRegime.guidance),
      sourceSystem: 'macro-regime-engine',
      mode: 'manual',
      fetchedAt,
      freshnessLabel: prepared.macroRegime.guidance.summary[0] ?? 'macro overlay'
    }
  ];
}
