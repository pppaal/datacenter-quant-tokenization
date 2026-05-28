import { generateUnderwritingMemo } from '@/lib/ai/openai';
import { applyCreditOverlay } from '@/lib/services/valuation/credit-overlay';
import { pickBaseScenario } from '@/lib/services/valuation/scenario-utils';
import { debtDdChecklistItem } from '@/lib/services/valuation/stabilized-income-configs';
import {
  buildStabilizedIncomeAssumptions,
  buildStabilizedIncomeDdChecklist,
  buildStabilizedIncomeKeyRisks,
  buildStabilizedIncomeProvenance,
  buildStabilizedIncomeValuation,
  type StabilizedIncomeProvenanceConfig,
  type StabilizedIncomeScenarioInput
} from '@/lib/services/valuation/stabilized-income';
import type {
  UnderwritingAnalysis,
  UnderwritingBundle,
  ValuationStrategyContext
} from '@/lib/services/valuation/types';

// Derive the config shapes locally so the strategy stays self-contained and we
// avoid touching the shared stabilized-income-configs module (other than the
// reused debt DD checklist item, which is imported, not edited).
type ValuationConfig = Parameters<typeof buildStabilizedIncomeValuation>[2];
type RiskConfig = Parameters<typeof buildStabilizedIncomeKeyRisks>[2];
type ProvenanceConfig = StabilizedIncomeProvenanceConfig;

// MIXED_USE = a Korean 주상복합 / retail-podium-plus-office-or-residential-tower.
// Every economic input below is intentionally set BETWEEN the office and retail
// configs (office: cap 5.5%, opex 18%; retail: cap 6.1%, opex 22%) because a
// mixed asset blends the tighter office income stream with the wider retail one;
// downside (Bear) is wider than office but narrower than pure retail.
const mixedUseScenarioInputs: StabilizedIncomeScenarioInput[] = [
  {
    name: 'Bull',
    scenarioOrder: 0,
    occupancyBumpPct: 4,
    capRateShiftPct: -0.35,
    noiFactor: 1.055,
    note: 'Office and retail components both lease firmly and blended exit pricing compresses modestly.'
  },
  {
    name: 'Base',
    scenarioOrder: 1,
    occupancyBumpPct: 0,
    capRateShiftPct: 0,
    noiFactor: 1,
    note: 'Base case screening blending stabilized office and retail occupancy, market cap rate, and current leverage.'
  },
  {
    name: 'Bear',
    scenarioOrder: 2,
    occupancyBumpPct: -8.5,
    capRateShiftPct: 0.65,
    noiFactor: 0.89,
    note: 'Retail footfall softens while office rollover widens downtime, and blended exit pricing moves against the deal.'
  }
];

export function buildMixedUseValuationConfig(): ValuationConfig {
  return {
    defaultRentableAreaSqm: 11000,
    occupancy: {
      floorPct: 52,
      ceilingPct: 100,
      // 90% blends office (92%) and retail (90%) stabilized occupancy.
      fallbackPct: 90,
      scenarioFloorPct: 44,
      scenarioCeilingPct: 98
    },
    capRate: {
      floorPct: 4,
      // 5.8% sits between office (5.5%) and retail (6.1%).
      fallbackPct: 5.8,
      scenarioFloorPct: 3.75
    },
    purchaseFallbackPerSqmKrw: 4_800_000,
    // 53% LTV is between office (55%) and retail (52%).
    debtLtvDefaultPct: 53,
    debtCostFloorPct: 3.55,
    debtCostFallbackPct: 5.25,
    debtServiceSpreadPct: 1.22,
    confidence: {
      floor: 4.8,
      ceiling: 9,
      base: 5.05,
      comparableThreshold: 2,
      comparableBonus: 0.75,
      transactionCompBonus: 0.35,
      rentCompBonus: 0.3,
      purchaseBonus: 0.4,
      stabilizedOccupancyBonus: 0.3
    },
    scenarioInputs: mixedUseScenarioInputs,
    monthlyRentPerSqmKrw: (state) =>
      Math.max(
        state.marketEvidence.averageMonthlyRentPerSqmKrw ?? 0,
        ((state.marketValueProxyKrw ?? state.bundle.asset.purchasePriceKrw ?? 0) *
          (state.capRatePct / 100)) /
          Math.max(state.rentableAreaSqm * 12 * Math.max(state.adjustedOccupancyPct / 100, 0.52), 1)
      ),
    // 1.65% credit loss blends office (1.5%) and retail (1.8%).
    creditLossPct: () => 1.65,
    vacancyAllowancePct: (state) => Math.max(100 - state.adjustedOccupancyPct, 4.5),
    effectiveRentalRevenueKrw: (state) =>
      state.grossPotentialRentKrw *
      Math.max(0.48, state.adjustedOccupancyPct / 100) *
      Math.max(0.71, 1 - (state.vacancyAllowancePct + state.creditLossPct) / 100),
    // 2.5% other income blends office (2%) and retail (3%).
    otherIncomeKrw: (state) => state.grossPotentialRentKrw * 0.025,
    annualOpexKrw: (state) =>
      // 20% opex ratio is the midpoint of office (18%) and retail (22%).
      state.bundle.asset.opexAssumptionKrw ?? state.grossPotentialRentKrw * 0.2,
    annualCapexReserveKrw: (state) =>
      state.bundle.asset.capexAssumptionKrw
        ? state.bundle.asset.capexAssumptionKrw * 0.038
        : state.grossPotentialRentKrw * 0.009,
    stabilizedNoiKrw: (state) =>
      Math.max(
        state.effectiveRentalRevenueKrw +
          state.otherIncomeKrw -
          state.annualOpexKrw -
          state.annualCapexReserveKrw,
        state.annualOpexKrw * 1.15
      ),
    scenario: (state, input) => {
      const scenarioOccupancyPct = Math.min(
        100,
        Math.max(44, state.adjustedOccupancyPct + input.occupancyBumpPct)
      );
      const scenarioCapRatePct = Math.max(3.75, state.capRatePct + input.capRateShiftPct);
      const scenarioNoiKrw =
        state.stabilizedNoiKrw *
        input.noiFactor *
        (scenarioOccupancyPct / state.adjustedOccupancyPct);
      const valuationKrw = scenarioNoiKrw / (scenarioCapRatePct / 100);

      return {
        valuationKrw,
        impliedYieldPct: (scenarioNoiKrw / valuationKrw) * 100,
        exitCapRatePct: scenarioCapRatePct,
        debtServiceCoverage: scenarioNoiKrw / state.annualDebtServiceKrw
      };
    }
  };
}

const mixedUseRiskConfig: RiskConfig = {
  vacancyThreshold: 11,
  vacancyHighRisk:
    'Vacancy is elevated across one or more components and could pressure the blended income stream.',
  vacancyFallbackRisk:
    'Occupancy across the office, retail, and any residential components still needs component-level support before committee.',
  comparablePresentRisk:
    'Comparable pricing exists, but cross-use cap-rate reconciliation should be refreshed against recent mixed-use trades.',
  comparableMarketRisk:
    'Raw market comps are loaded, but curated weighting and cross-use cap-rate reconciliation should still be reviewed before committee.',
  comparableMissingRisk:
    'No mixed-use comparable set is loaded yet, so valuation still relies on a blended office/retail cap-rate heuristic.',
  entryDefinedRisk:
    'Entry basis is captured, but multiple income streams and differing lease structures per component still need rent-roll validation.',
  entryMissingRisk:
    'Entry pricing remains provisional and should be reconciled against component-level broker guidance and recent mixed-use trades.',
  capexDefinedRisk:
    'Capex timing and common-area cost allocation across components should be validated against the business plan.',
  capexMissingRisk:
    'Re-tenanting capex and common-area cost allocation across components remain under-specified for the current screen.',
  leverageThresholdRatio: 0.58,
  leverageHighRisk:
    'Leverage is high for a first-pass mixed-use screen and should be stress-tested against softer blended NOI.',
  leverageFallbackRisk:
    'Debt sizing is still high-level and should be reconciled against lender-specific covenants and amortization.',
  extraRisks: [
    'Strata/condo ownership split across components must be confirmed; fragmented ownership can constrain control and exit.',
    'Differing lease structures per component (office WALT vs. retail turnover rent) require separate rollover schedules.'
  ]
};

const mixedUseDdChecklistBase = [
  'Load component-level rent rolls (office, retail, and any residential) with WALT and tenant concentration.',
  'Reconcile cross-use cap rates and confirm the blended exit yield against recent mixed-use trades.',
  'Confirm strata/condo ownership split and any shared-facility or master-association obligations.',
  'Validate common-area cost allocation, recoveries, and differing lease structures per component.'
];

const mixedUseProvenanceConfig: ProvenanceConfig = {
  rentableArea: {
    fallbackSourceSystem: 'gross-area-fallback',
    intakeLabel: 'mixed-use intake'
  }
};

export async function buildMixedUseValuationAnalysis(
  bundle: UnderwritingBundle,
  context: ValuationStrategyContext = {}
): Promise<UnderwritingAnalysis> {
  const valuation = buildStabilizedIncomeValuation(bundle, context, buildMixedUseValuationConfig());
  const baseScenario = pickBaseScenario(valuation.scenarios) ?? valuation.scenarios[0];

  const analysis: UnderwritingAnalysis = {
    asset: {
      name: bundle.asset.name,
      assetCode: bundle.asset.assetCode,
      assetClass: bundle.asset.assetClass,
      stage: bundle.asset.stage,
      market: bundle.asset.market
    },
    baseCaseValueKrw: baseScenario.valuationKrw,
    confidenceScore: valuation.confidenceScore,
    underwritingMemo: '',
    keyRisks: buildStabilizedIncomeKeyRisks(bundle, valuation, mixedUseRiskConfig),
    ddChecklist: buildStabilizedIncomeDdChecklist(mixedUseDdChecklistBase, debtDdChecklistItem),
    assumptions: buildStabilizedIncomeAssumptions(
      'MIXED_USE',
      valuation,
      bundle.comparableSet?.entries.length ?? 0
    ),
    provenance: buildStabilizedIncomeProvenance(bundle, valuation, mixedUseProvenanceConfig),
    scenarios: valuation.scenarios
  };

  const finalized = applyCreditOverlay(analysis, bundle);
  finalized.underwritingMemo = await generateUnderwritingMemo(finalized);

  return finalized;
}
