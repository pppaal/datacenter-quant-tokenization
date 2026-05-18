import { buildMacroRegimeAnalysis } from '@/lib/services/macro/regime';
import { buildIncomeMarketEvidence } from '@/lib/services/valuation/market-evidence';
import { buildOrderedScenarioOutputs } from '@/lib/services/valuation/scenario-utils';
import type {
  UnderwritingBundle,
  UnderwritingScenario,
  ValuationStrategyContext
} from '@/lib/services/valuation/types';
import { roundKrw } from '@/lib/services/valuation/utils';
import type { ProvenanceEntry } from '@/lib/sources/types';

type StrategyState = {
  bundle: UnderwritingBundle;
  context: ValuationStrategyContext;
  macroRegime: ReturnType<typeof buildMacroRegimeAnalysis>;
  marketEvidence: ReturnType<typeof buildIncomeMarketEvidence>;
  rentableAreaSqm: number;
  occupancyPct: number;
  adjustedOccupancyPct: number;
  capRatePct: number;
  comparableValuePerSqm: number | null;
  marketPricePerSqmKrw: number | null;
  marketValueProxyKrw: number | null;
};

type StrategyStateWithPrice = StrategyState & {
  purchasePriceKrw: number;
};

type StrategyStateWithRent = StrategyStateWithPrice & {
  monthlyRentPerSqmKrw: number;
};

type StrategyStateWithRevenue = StrategyStateWithRent & {
  grossPotentialRentKrw: number;
  vacancyAllowancePct: number;
  creditLossPct: number;
  effectiveRentalRevenueKrw: number;
  otherIncomeKrw: number;
};

type StrategyStateWithExpenses = StrategyStateWithRevenue & {
  annualOpexKrw: number;
  annualCapexReserveKrw: number;
  tenantImprovementReserveKrw: number | null;
  leasingCommissionReserveKrw: number | null;
  stabilizedNoiKrw: number;
};

type ScenarioComputation = {
  valuationKrw: number;
  impliedYieldPct: number;
  exitCapRatePct: number;
  debtServiceCoverage: number;
};

export type StabilizedIncomeValuation = StrategyStateWithExpenses & {
  debtLtvPct: number;
  debtCostPct: number;
  debtPrincipalKrw: number;
  annualDebtServiceKrw: number;
  confidenceScore: number;
  scenarios: UnderwritingScenario[];
};

type RentableAreaProvenanceConfig = {
  fallbackSourceSystem: string;
  intakeLabel: string;
};

type OptionalProvenanceFieldConfig = {
  field: string;
  value: string | number | null;
  sourceSystem: string;
  fallbackSourceSystem?: string;
  freshnessLabel: string;
  fallbackFreshnessLabel?: string;
  hasPrimaryValue?: boolean;
};

export type StabilizedIncomeProvenanceConfig = {
  rentableArea: RentableAreaProvenanceConfig;
  occupancy?: OptionalProvenanceFieldConfig;
  rent?: OptionalProvenanceFieldConfig;
};

type StabilizedIncomeRiskConfig = {
  vacancyThreshold: number;
  vacancyHighRisk: string;
  vacancyFallbackRisk: string;
  comparablePresentRisk: string;
  comparableMarketRisk: string;
  comparableMissingRisk: string;
  entryDefinedRisk: string;
  entryMissingRisk: string;
  capexDefinedRisk: string;
  capexMissingRisk: string;
  leverageThresholdRatio: number;
  leverageHighRisk: string;
  leverageFallbackRisk: string;
  extraRisks?: string[];
};

export function buildStabilizedIncomeAssumptions(
  assetClass: string,
  valuation: StabilizedIncomeValuation,
  comparableEntryCount: number,
  extra: Record<string, unknown> = {}
) {
  return {
    assetClass,
    rentableAreaSqm: valuation.rentableAreaSqm,
    occupancyPct: Number(valuation.adjustedOccupancyPct.toFixed(2)),
    monthlyRentPerSqmKrw: roundKrw(valuation.monthlyRentPerSqmKrw),
    grossPotentialRentKrw: roundKrw(valuation.grossPotentialRentKrw),
    effectiveRentalRevenueKrw: roundKrw(valuation.effectiveRentalRevenueKrw),
    otherIncomeKrw: roundKrw(valuation.otherIncomeKrw),
    purchasePriceKrw: roundKrw(valuation.purchasePriceKrw),
    annualOpexKrw: roundKrw(valuation.annualOpexKrw),
    annualCapexReserveKrw: roundKrw(valuation.annualCapexReserveKrw),
    stabilizedNoiKrw: roundKrw(valuation.stabilizedNoiKrw),
    capRatePct: Number(valuation.capRatePct.toFixed(2)),
    debtLtvPct: Number(valuation.debtLtvPct.toFixed(2)),
    debtCostPct: Number(valuation.debtCostPct.toFixed(2)),
    vacancyAllowancePct: Number(valuation.vacancyAllowancePct.toFixed(2)),
    creditLossPct:
      typeof valuation.creditLossPct === 'number'
        ? Number(valuation.creditLossPct.toFixed(2))
        : valuation.creditLossPct,
    comparableEntryCount,
    comparableValuePerSqmKrw: valuation.comparableValuePerSqm
      ? roundKrw(valuation.comparableValuePerSqm)
      : null,
    marketTransactionCompCount: valuation.marketEvidence.transactionCompCount,
    marketRentCompCount: valuation.marketEvidence.rentCompCount,
    marketIndicatorCount: valuation.marketEvidence.indicatorCount,
    marketEvidencePricePerSqmKrw: valuation.marketEvidence.averageTransactionPricePerSqmKrw
      ? roundKrw(valuation.marketEvidence.averageTransactionPricePerSqmKrw)
      : null,
    marketEvidenceRentPerSqmKrw: valuation.marketEvidence.averageMonthlyRentPerSqmKrw
      ? roundKrw(valuation.marketEvidence.averageMonthlyRentPerSqmKrw)
      : null,
    marketEvidenceCapRatePct: valuation.marketEvidence.averageCapRatePct
      ? Number(valuation.marketEvidence.averageCapRatePct.toFixed(2))
      : null,
    marketEvidenceOccupancyPct: valuation.marketEvidence.averageOccupancyPct
      ? Number(valuation.marketEvidence.averageOccupancyPct.toFixed(2))
      : null,
    macroRegime: valuation.macroRegime,
    ...extra
  };
}

export function buildStabilizedIncomeKeyRisks(
  bundle: UnderwritingBundle,
  valuation: StabilizedIncomeValuation,
  config: StabilizedIncomeRiskConfig
) {
  return [
    bundle.marketSnapshot?.vacancyPct != null &&
    bundle.marketSnapshot.vacancyPct > config.vacancyThreshold
      ? config.vacancyHighRisk
      : config.vacancyFallbackRisk,
    ...(config.extraRisks ?? []),
    valuation.comparableValuePerSqm
      ? config.comparablePresentRisk
      : valuation.marketEvidence.transactionCompCount > 0
        ? config.comparableMarketRisk
        : config.comparableMissingRisk,
    bundle.asset.purchasePriceKrw ? config.entryDefinedRisk : config.entryMissingRisk,
    bundle.asset.capexAssumptionKrw ? config.capexDefinedRisk : config.capexMissingRisk,
    valuation.debtPrincipalKrw > config.leverageThresholdRatio * valuation.purchasePriceKrw
      ? config.leverageHighRisk
      : config.leverageFallbackRisk
  ];
}

export function buildStabilizedIncomeDdChecklist(baseItems: string[], debtItem: string) {
  return [...baseItems, debtItem];
}

export type StabilizedIncomeScenarioInput = {
  name: UnderwritingScenario['name'];
  scenarioOrder: number;
  occupancyBumpPct: number;
  capRateShiftPct: number;
  noiFactor: number;
  note: string;
};

type OccupancyConfig = {
  floorPct: number;
  ceilingPct: number;
  fallbackPct: number;
  scenarioFloorPct: number;
  scenarioCeilingPct: number;
};

type CapRateConfig = {
  floorPct: number;
  fallbackPct: number;
  scenarioFloorPct: number;
};

type ConfidenceConfig = {
  floor: number;
  ceiling: number;
  base: number;
  comparableThreshold: number;
  comparableBonus: number;
  transactionCompBonus: number;
  rentCompBonus: number;
  purchaseBonus: number;
  stabilizedOccupancyBonus: number;
  extraBonus?: (state: StrategyStateWithExpenses) => number;
};

type StabilizedIncomeConfig = {
  defaultRentableAreaSqm: number;
  occupancy: OccupancyConfig;
  capRate: CapRateConfig;
  purchaseFallbackPerSqmKrw: number;
  debtLtvDefaultPct: number;
  debtCostFloorPct: number;
  debtCostFallbackPct: number;
  debtServiceSpreadPct: number;
  confidence: ConfidenceConfig;
  scenarioInputs: StabilizedIncomeScenarioInput[];
  monthlyRentPerSqmKrw: (state: StrategyStateWithPrice) => number;
  vacancyAllowancePct: (state: StrategyStateWithRevenue) => number;
  creditLossPct: (state: StrategyStateWithRent) => number;
  effectiveRentalRevenueKrw: (state: StrategyStateWithRevenue) => number;
  otherIncomeKrw: (state: StrategyStateWithRevenue) => number;
  annualOpexKrw: (state: StrategyStateWithRevenue) => number;
  annualCapexReserveKrw: (state: StrategyStateWithRevenue) => number;
  tenantImprovementReserveKrw?: (state: StrategyStateWithRevenue) => number;
  leasingCommissionReserveKrw?: (state: StrategyStateWithRevenue) => number;
  stabilizedNoiKrw: (state: StrategyStateWithExpenses) => number;
  scenario: (
    state: StabilizedIncomeValuation,
    input: StabilizedIncomeScenarioInput
  ) => ScenarioComputation;
};

export function averageComparableValuePerSqm(bundle: UnderwritingBundle) {
  const comparableEntries = bundle.comparableSet?.entries ?? [];
  const perSqmValues = comparableEntries
    .map((entry) => {
      if (!entry.valuationKrw || !entry.grossFloorAreaSqm) return null;
      return entry.valuationKrw / entry.grossFloorAreaSqm;
    })
    .filter((value): value is number => value !== null && Number.isFinite(value));

  if (perSqmValues.length === 0) return null;
  return perSqmValues.reduce((sum, value) => sum + value, 0) / perSqmValues.length;
}

export function buildStabilizedIncomeProvenance(
  bundle: UnderwritingBundle,
  valuation: StabilizedIncomeValuation,
  config: StabilizedIncomeProvenanceConfig
): ProvenanceEntry[] {
  const now = new Date().toISOString();
  const entries: ProvenanceEntry[] = [
    {
      field: 'rentableAreaSqm',
      value: valuation.rentableAreaSqm,
      sourceSystem: bundle.asset.rentableAreaSqm
        ? 'asset-intake'
        : config.rentableArea.fallbackSourceSystem,
      mode: 'manual',
      fetchedAt: now,
      freshnessLabel: bundle.asset.rentableAreaSqm
        ? config.rentableArea.intakeLabel
        : 'gross area fallback'
    },
    {
      field: 'capRatePct',
      value: bundle.asset.exitCapRatePct ?? bundle.marketSnapshot?.capRatePct ?? null,
      sourceSystem: bundle.asset.exitCapRatePct ? 'asset-intake' : 'market-snapshot',
      mode:
        bundle.marketSnapshot?.sourceStatus === 'FRESH'
          ? 'api'
          : bundle.marketSnapshot?.sourceStatus === 'MANUAL'
            ? 'manual'
            : 'fallback',
      fetchedAt: bundle.marketSnapshot?.sourceUpdatedAt?.toISOString() ?? now,
      freshnessLabel: bundle.marketSnapshot?.sourceStatus?.toLowerCase() ?? 'manual assumption'
    },
    {
      field: 'purchasePriceKrw',
      value: bundle.asset.purchasePriceKrw ?? bundle.asset.currentValuationKrw ?? null,
      sourceSystem: bundle.asset.purchasePriceKrw ? 'asset-intake' : 'current-valuation-fallback',
      mode: 'manual',
      fetchedAt: now,
      freshnessLabel: bundle.asset.purchasePriceKrw
        ? 'purchase assumption'
        : 'current valuation fallback'
    },
    {
      field: 'macro.guidance',
      value: JSON.stringify(valuation.macroRegime.guidance),
      sourceSystem: 'macro-regime-engine',
      mode: 'manual',
      fetchedAt: now,
      freshnessLabel: valuation.macroRegime.guidance.summary[0] ?? 'macro overlay'
    },
    {
      field: 'marketEvidence.summary',
      value: JSON.stringify({
        transactionCompCount: valuation.marketEvidence.transactionCompCount,
        rentCompCount: valuation.marketEvidence.rentCompCount,
        indicatorCount: valuation.marketEvidence.indicatorCount
      }),
      sourceSystem: 'global-market-api',
      mode: 'api',
      fetchedAt: now,
      freshnessLabel: 'live market evidence'
    }
  ];

  if (config.occupancy) {
    entries.splice(2, 0, {
      field: config.occupancy.field,
      value: config.occupancy.value,
      sourceSystem: bundle.asset.stabilizedOccupancyPct
        ? config.occupancy.sourceSystem
        : (config.occupancy.fallbackSourceSystem ?? 'market-vacancy-fallback'),
      mode: 'manual',
      fetchedAt: now,
      freshnessLabel: bundle.asset.stabilizedOccupancyPct
        ? config.occupancy.freshnessLabel
        : (config.occupancy.fallbackFreshnessLabel ?? 'vacancy-derived fallback')
    });
  }

  if (config.rent) {
    const hasPrimaryValue = config.rent.hasPrimaryValue ?? Boolean(config.rent.value);
    entries.splice(3, 0, {
      field: config.rent.field,
      value: config.rent.value,
      sourceSystem: hasPrimaryValue
        ? config.rent.sourceSystem
        : (config.rent.fallbackSourceSystem ?? 'fallback-rent-proxy'),
      mode: 'manual',
      fetchedAt: now,
      freshnessLabel: hasPrimaryValue
        ? config.rent.freshnessLabel
        : (config.rent.fallbackFreshnessLabel ?? 'proxy')
    });
  }

  return entries;
}

export function buildStabilizedIncomeValuation(
  bundle: UnderwritingBundle,
  context: ValuationStrategyContext,
  config: StabilizedIncomeConfig
): StabilizedIncomeValuation {
  const macroRegime = buildMacroRegimeAnalysis({
    assetClass: bundle.asset.assetClass,
    market: bundle.asset.market,
    country: bundle.address?.country,
    submarket: bundle.marketSnapshot?.metroRegion,
    marketSnapshot: bundle.marketSnapshot,
    series: bundle.macroSeries ?? [],
    profileRules: context.profileRules
  });
  const { guidance: macroGuidance } = macroRegime;
  const marketEvidence = buildIncomeMarketEvidence(bundle, bundle.asset.assetClass);
  const rentableAreaSqm =
    bundle.asset.rentableAreaSqm ?? bundle.asset.grossFloorAreaSqm ?? config.defaultRentableAreaSqm;
  const occupancyPct = Math.min(
    config.occupancy.ceilingPct,
    Math.max(
      config.occupancy.floorPct,
      bundle.asset.stabilizedOccupancyPct ??
        marketEvidence.averageOccupancyPct ??
        bundle.asset.occupancyAssumptionPct ??
        (bundle.marketSnapshot?.vacancyPct != null
          ? 100 - bundle.marketSnapshot.vacancyPct
          : config.occupancy.fallbackPct)
    )
  );
  const adjustedOccupancyPct = Math.min(
    config.occupancy.ceilingPct,
    Math.max(config.occupancy.scenarioFloorPct, occupancyPct + macroGuidance.occupancyShiftPct)
  );
  const capRatePct = Math.max(
    config.capRate.floorPct,
    (bundle.asset.exitCapRatePct ??
      marketEvidence.averageCapRatePct ??
      bundle.marketSnapshot?.capRatePct ??
      config.capRate.fallbackPct) + macroGuidance.exitCapRateShiftPct
  );
  const comparableValuePerSqm = averageComparableValuePerSqm(bundle);
  const marketPricePerSqmKrw =
    comparableValuePerSqm ?? marketEvidence.averageTransactionPricePerSqmKrw;
  const marketValueProxyKrw = marketPricePerSqmKrw ? marketPricePerSqmKrw * rentableAreaSqm : null;

  const state: StrategyState = {
    bundle,
    context,
    macroRegime,
    marketEvidence,
    rentableAreaSqm,
    occupancyPct,
    adjustedOccupancyPct,
    capRatePct,
    comparableValuePerSqm,
    marketPricePerSqmKrw,
    marketValueProxyKrw
  };

  const purchasePriceKrw =
    bundle.asset.purchasePriceKrw ??
    bundle.asset.currentValuationKrw ??
    marketValueProxyKrw ??
    rentableAreaSqm * config.purchaseFallbackPerSqmKrw;
  const stateWithPrice: StrategyStateWithPrice = {
    ...state,
    purchasePriceKrw
  };

  const monthlyRentPerSqmKrw = config.monthlyRentPerSqmKrw(stateWithPrice);
  const stateWithRent: StrategyStateWithRent = {
    ...stateWithPrice,
    monthlyRentPerSqmKrw
  };

  const grossPotentialRentKrw = rentableAreaSqm * monthlyRentPerSqmKrw * 12;
  const creditLossPct = config.creditLossPct(stateWithRent);
  const interimRevenueState: StrategyStateWithRevenue = {
    ...stateWithRent,
    grossPotentialRentKrw,
    creditLossPct,
    vacancyAllowancePct: 0,
    effectiveRentalRevenueKrw: 0,
    otherIncomeKrw: 0
  };
  const vacancyAllowancePct = config.vacancyAllowancePct(interimRevenueState);
  const revenueState: StrategyStateWithRevenue = {
    ...interimRevenueState,
    vacancyAllowancePct
  };
  const effectiveRentalRevenueKrw = config.effectiveRentalRevenueKrw(revenueState);
  const otherIncomeKrw = config.otherIncomeKrw({
    ...revenueState,
    effectiveRentalRevenueKrw
  });
  const completedRevenueState: StrategyStateWithRevenue = {
    ...revenueState,
    effectiveRentalRevenueKrw,
    otherIncomeKrw
  };

  const annualOpexKrw = config.annualOpexKrw(completedRevenueState);
  const annualCapexReserveKrw = config.annualCapexReserveKrw(completedRevenueState);
  const tenantImprovementReserveKrw = config.tenantImprovementReserveKrw
    ? config.tenantImprovementReserveKrw(completedRevenueState)
    : null;
  const leasingCommissionReserveKrw = config.leasingCommissionReserveKrw
    ? config.leasingCommissionReserveKrw(completedRevenueState)
    : null;
  const expenseState: StrategyStateWithExpenses = {
    ...completedRevenueState,
    annualOpexKrw,
    annualCapexReserveKrw,
    tenantImprovementReserveKrw,
    leasingCommissionReserveKrw,
    stabilizedNoiKrw: 0
  };
  const stabilizedNoiKrw = config.stabilizedNoiKrw(expenseState);
  const stateWithExpenses: StrategyStateWithExpenses = {
    ...expenseState,
    stabilizedNoiKrw
  };

  const debtLtvPct = bundle.asset.financingLtvPct ?? config.debtLtvDefaultPct;
  const debtCostPct = Math.max(
    config.debtCostFloorPct,
    (bundle.asset.financingRatePct ??
      bundle.marketSnapshot?.debtCostPct ??
      config.debtCostFallbackPct) + macroGuidance.debtCostShiftPct
  );
  const debtPrincipalKrw = purchasePriceKrw * (debtLtvPct / 100);
  const annualDebtServiceKrw = Math.max(
    debtPrincipalKrw * ((debtCostPct + config.debtServiceSpreadPct) / 100),
    1
  );

  const confidenceScore = Number(
    Math.min(
      config.confidence.ceiling,
      Math.max(
        config.confidence.floor,
        config.confidence.base +
          (bundle.marketSnapshot ? 0.8 : 0) +
          ((bundle.comparableSet?.entries.length ?? 0) >= config.confidence.comparableThreshold
            ? config.confidence.comparableBonus
            : 0) +
          (marketEvidence.transactionCompCount >= 2 ? config.confidence.transactionCompBonus : 0) +
          (marketEvidence.rentCompCount >= 2 ? config.confidence.rentCompBonus : 0) +
          (bundle.asset.purchasePriceKrw ? config.confidence.purchaseBonus : 0) +
          (bundle.asset.stabilizedOccupancyPct ? config.confidence.stabilizedOccupancyBonus : 0) +
          (config.confidence.extraBonus ? config.confidence.extraBonus(stateWithExpenses) : 0)
      )
    ).toFixed(1)
  );

  const valuation: StabilizedIncomeValuation = {
    ...stateWithExpenses,
    debtLtvPct,
    debtCostPct,
    debtPrincipalKrw,
    annualDebtServiceKrw,
    confidenceScore,
    scenarios: []
  };

  valuation.scenarios = buildOrderedScenarioOutputs(
    config.scenarioInputs.map((input) => {
      const scenario = config.scenario(valuation, input);
      return {
        name: input.name,
        valuationKrw: roundKrw(scenario.valuationKrw),
        impliedYieldPct: scenario.impliedYieldPct,
        exitCapRatePct: scenario.exitCapRatePct,
        debtServiceCoverage: scenario.debtServiceCoverage,
        notes: input.note,
        scenarioOrder: input.scenarioOrder
      };
    })
  );

  return valuation;
}
