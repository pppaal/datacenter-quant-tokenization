import { generateUnderwritingMemo } from '@/lib/ai/openai';
import { applyCreditOverlay } from '@/lib/services/valuation/credit-overlay';
import { computeCostApproach } from '@/lib/services/valuation/cost-approach';
import { computeEquityWaterfall } from '@/lib/services/valuation/equity-waterfall';
import { prepareValuationInputs } from '@/lib/services/valuation/inputs';
import { computeLeaseDcf } from '@/lib/services/valuation/lease-dcf';
import { buildStoredBaseCaseProForma } from '@/lib/services/valuation/pro-forma';
import { buildDebtSchedule } from '@/lib/services/valuation/project-finance';
import { buildScenarioOutput, pickBaseScenario, sortScenariosByOrder } from '@/lib/services/valuation/scenario-utils';
import type {
  PreparedUnderwritingInputs,
  ScenarioInput,
  UnderwritingAnalysis,
  UnderwritingBundle,
  UnderwritingScenario,
  ValuationStrategyContext
} from '@/lib/services/valuation/types';
import { clamp, roundKrw, safeDivide } from '@/lib/services/valuation/utils';
import type { ProvenanceEntry } from '@/lib/sources/types';

export type { UnderwritingAnalysis, UnderwritingBundle, UnderwritingScenario } from '@/lib/services/valuation/types';

type ScenarioEvaluation = {
  scenario: UnderwritingScenario;
  weightedValueKrw: number;
  costApproach: ReturnType<typeof computeCostApproach>;
  leaseDcf: ReturnType<typeof computeLeaseDcf>;
  debtSchedule: ReturnType<typeof buildDebtSchedule>;
  equityWaterfall: ReturnType<typeof computeEquityWaterfall>;
};

const scenarioInputs: ScenarioInput[] = [
  {
    name: 'Bull',
    scenarioOrder: 0,
    note: 'Comparable pricing tightens and lease-up closes faster than the base committee plan.',
    revenueFactor: 1.08,
    capRateShiftPct: -0.35,
    discountRateShiftPct: -0.45,
    costFactor: 0.97,
    floorFactor: 1.08,
    leaseProbabilityBumpPct: 6,
    debtSpreadBumpPct: -0.1
  },
  {
    name: 'Base',
    scenarioOrder: 1,
    note: 'Base institutional case using calibrated comps, lease underwriting, tax leakage, and project finance sizing.',
    revenueFactor: 1,
    capRateShiftPct: 0,
    discountRateShiftPct: 0,
    costFactor: 1,
    floorFactor: 1,
    leaseProbabilityBumpPct: 0,
    debtSpreadBumpPct: 0
  },
  {
    name: 'Bear',
    scenarioOrder: 2,
    note: 'Delayed utility approvals, softer pricing, and wider debt spreads pressure exit value and coverage.',
    revenueFactor: 0.91,
    capRateShiftPct: 0.7,
    discountRateShiftPct: 0.65,
    costFactor: 1.08,
    floorFactor: 0.92,
    leaseProbabilityBumpPct: -9,
    debtSpreadBumpPct: 0.45
  }
];

function buildScenarioValue(evaluation: ScenarioEvaluation) {
  const approachValues = [
    {
      label: 'replacementFloor',
      value: evaluation.costApproach.replacementCostFloorKrw,
      weight: 0.2
    },
    {
      label: 'incomeApproach',
      value: evaluation.leaseDcf.incomeApproachValueKrw,
      weight: 0.2
    },
    {
      label: 'leaseDcf',
      value: evaluation.leaseDcf.leaseDrivenValueKrw,
      weight: 0.25
    },
    {
      label: 'comparables',
      value: evaluation.costApproach.directComparableValueKrw,
      weight: evaluation.costApproach.directComparableValueKrw ? 0.2 : 0
    },
    {
      label: 'equityBridge',
      value: evaluation.equityWaterfall.enterpriseEquivalentValueKrw,
      weight: 0.15
    }
  ].filter((entry) => Number.isFinite(entry.value) && entry.value && entry.weight > 0) as Array<{
    label: string;
    value: number;
    weight: number;
  }>;

  const totalWeight = approachValues.reduce((sum, entry) => sum + entry.weight, 0);
  const weightedValueKrw = approachValues.reduce(
    (sum, entry) => sum + entry.value * (entry.weight / totalWeight),
    0
  );

  return {
    weightedValueKrw: Math.max(weightedValueKrw, evaluation.costApproach.replacementCostFloorKrw),
    approaches: Object.fromEntries(approachValues.map((entry) => [entry.label, roundKrw(entry.value)]))
  };
}

function evaluateScenario(
  prepared: PreparedUnderwritingInputs,
  scenarioInput: ScenarioInput
): ScenarioEvaluation {
  const costApproach = computeCostApproach(prepared, scenarioInput);
  const leaseDcf = computeLeaseDcf(prepared, scenarioInput);
  const debtSchedule = buildDebtSchedule(
    prepared,
    scenarioInput,
    leaseDcf.years.map((year) => year.cfadsBeforeDebtKrw)
  );
  const equityWaterfall = computeEquityWaterfall(prepared, scenarioInput, costApproach, leaseDcf, debtSchedule);
  const { weightedValueKrw } = buildScenarioValue(
    {
      scenario: {
        name: scenarioInput.name,
        valuationKrw: 0,
        impliedYieldPct: 0,
        exitCapRatePct: 0,
        debtServiceCoverage: 0,
        notes: scenarioInput.note,
        scenarioOrder: scenarioInput.scenarioOrder
      },
      weightedValueKrw: 0,
      costApproach,
      leaseDcf,
      debtSchedule,
      equityWaterfall
    }
  );
  const stabilizedNoiKrw = leaseDcf.stabilizedNoiKrw;
  const impliedYieldPct = safeDivide(stabilizedNoiKrw, weightedValueKrw, 0) * 100;
  const averageDscr =
    debtSchedule.years
      .map((year) => year.dscr)
      .filter((value): value is number => typeof value === 'number')
      .reduce((sum, value, _, source) => sum + value / source.length, 0) || 0;

  return {
    scenario: buildScenarioOutput({
      name: scenarioInput.name,
      valuationKrw: weightedValueKrw,
      impliedYieldPct,
      exitCapRatePct: prepared.baseCapRatePct + scenarioInput.capRateShiftPct,
      debtServiceCoverage: Math.max(averageDscr, 0.75),
      notes: scenarioInput.note,
      scenarioOrder: scenarioInput.scenarioOrder
    }),
    weightedValueKrw,
    costApproach,
    leaseDcf,
    debtSchedule,
    equityWaterfall
  };
}

function buildConfidenceScore(prepared: PreparedUnderwritingInputs) {
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

function buildKeyRisks(prepared: PreparedUnderwritingInputs, base: ScenarioEvaluation) {
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

  const risks = [
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
  ];

  return risks.slice(0, 5);
}

function buildDdChecklist(prepared: PreparedUnderwritingInputs) {
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

function buildAssumptions(prepared: PreparedUnderwritingInputs, evaluations: ScenarioEvaluation[]) {
  const base = evaluations.find((evaluation) => evaluation.scenario.name === 'Base') ?? evaluations[0];
  const approachMix = buildScenarioValue(base).approaches;

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

function buildProvenance(prepared: PreparedUnderwritingInputs): ProvenanceEntry[] {
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

export async function buildDataCenterValuationAnalysis(
  bundle: UnderwritingBundle,
  context: ValuationStrategyContext = {}
): Promise<UnderwritingAnalysis> {
  const prepared = prepareValuationInputs(bundle, context);
  const evaluations = scenarioInputs.map((input) => evaluateScenario(prepared, input));
  const scenarios = sortScenariosByOrder(evaluations.map((evaluation) => evaluation.scenario));
  const baseScenarioRef = pickBaseScenario(scenarios);
  const baseScenario =
    evaluations.find((evaluation) => evaluation.scenario.name === baseScenarioRef?.name) ?? evaluations[0];

  const analysis: UnderwritingAnalysis = {
    asset: {
      name: bundle.asset.name,
      assetCode: bundle.asset.assetCode,
      assetClass: bundle.asset.assetClass,
      stage: bundle.asset.stage,
      market: bundle.asset.market
    },
    baseCaseValueKrw: roundKrw(baseScenario.weightedValueKrw),
    confidenceScore: buildConfidenceScore(prepared),
    underwritingMemo: '',
    keyRisks: buildKeyRisks(prepared, baseScenario),
    ddChecklist: buildDdChecklist(prepared),
    assumptions: buildAssumptions(prepared, evaluations),
    provenance: buildProvenance(prepared),
    scenarios: sortScenariosByOrder(scenarios)
  };

  const finalized = applyCreditOverlay(analysis, bundle);
  finalized.underwritingMemo = await generateUnderwritingMemo(finalized);

  return finalized;
}
