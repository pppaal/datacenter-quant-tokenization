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

// Local mirrors of the engine's config shapes (same pattern as
// stabilized-income-configs.ts). Defined inline so this hotel strategy
// owns its hospitality-tuned economics without editing shared files.
type ValuationConfig = Parameters<typeof buildStabilizedIncomeValuation>[2];
type RiskConfig = Parameters<typeof buildStabilizedIncomeKeyRisks>[2];
type ProvenanceConfig = StabilizedIncomeProvenanceConfig;

// Hotels are RevPAR-driven and far more volatile than office: the Bear
// case widens occupancy/cap-rate moves materially versus an office screen.
const hotelScenarioInputs: StabilizedIncomeScenarioInput[] = [
  {
    name: 'Bull',
    scenarioOrder: 0,
    occupancyBumpPct: 6,
    capRateShiftPct: -0.4,
    noiFactor: 1.1,
    note: 'ADR and RevPAR run ahead of the underwriting case and exit yields compress on stronger trading.'
  },
  {
    name: 'Base',
    scenarioOrder: 1,
    occupancyBumpPct: 0,
    capRateShiftPct: 0,
    noiFactor: 1,
    note: 'Base case screening using stabilized occupancy, market exit yield, and current leverage assumptions.'
  },
  {
    name: 'Bear',
    scenarioOrder: 2,
    occupancyBumpPct: -14,
    capRateShiftPct: 1.0,
    noiFactor: 0.78,
    note: 'RevPAR softens through a demand/seasonality shock, GOP margin compresses, and exit yields widen against entry.'
  }
];

export function buildHotelValuationConfig(): ValuationConfig {
  return {
    defaultRentableAreaSqm: 14000,
    occupancy: {
      // Lower stabilized occupancy reflects ADR/RevPAR-style room
      // utilization rather than long-lease physical occupancy.
      floorPct: 45,
      ceilingPct: 95,
      fallbackPct: 71,
      scenarioFloorPct: 35,
      scenarioCeilingPct: 90
    },
    capRate: {
      // Higher stabilized cap rate (fallback ~6.8%) prices the operating
      // risk of a hospitality business versus a leased office.
      floorPct: 5.0,
      fallbackPct: 6.8,
      scenarioFloorPct: 4.75
    },
    purchaseFallbackPerSqmKrw: 6_000_000,
    debtLtvDefaultPct: 50,
    debtCostFloorPct: 3.8,
    debtCostFallbackPct: 5.6,
    debtServiceSpreadPct: 1.4,
    confidence: {
      floor: 4.6,
      ceiling: 8.8,
      base: 4.9,
      comparableThreshold: 2,
      comparableBonus: 0.7,
      transactionCompBonus: 0.35,
      rentCompBonus: 0.3,
      purchaseBonus: 0.4,
      stabilizedOccupancyBonus: 0.25
    },
    scenarioInputs: hotelScenarioInputs,
    // Prioritize real rent/RevPAR evidence; back-solved rent is the fallback floor.
    monthlyRentPerSqmKrw: (state) =>
      Math.max(
        state.marketEvidence.averageMonthlyRentPerSqmKrw ?? 0,
        (state.purchasePriceKrw * (state.capRatePct / 100)) /
          Math.max(state.rentableAreaSqm * 12 * Math.max(state.adjustedOccupancyPct / 100, 0.45), 1)
      ),
    creditLossPct: () => 1.5,
    vacancyAllowancePct: (state) => Math.max(100 - state.adjustedOccupancyPct, 8),
    // EGI applies the occupancy/vacancy haircut EXACTLY ONCE via
    // adjustedOccupancyPct; only the credit-loss term is layered on top.
    effectiveRentalRevenueKrw: (state) =>
      state.grossPotentialRentKrw *
      Math.max(0.45, state.adjustedOccupancyPct / 100) *
      Math.max(0.6, 1 - state.creditLossPct / 100),
    // Hotels run F&B, spa, events and other ancillary income well above an
    // office's modest other-income line.
    otherIncomeKrw: (state) => state.grossPotentialRentKrw * 0.18,
    // Hotels are operating-intensive: ~65% of revenue is opex (payroll,
    // housekeeping, F&B cost of sales, utilities) vs office ~18%. This is
    // the core economic difference for a hospitality asset.
    annualOpexKrw: (state) =>
      state.bundle.asset.opexAssumptionKrw ?? state.grossPotentialRentKrw * 0.65,
    annualCapexReserveKrw: (state) =>
      state.bundle.asset.capexAssumptionKrw
        ? state.bundle.asset.capexAssumptionKrw * 0.05
        : state.grossPotentialRentKrw * 0.04,
    stabilizedNoiKrw: (state) =>
      Math.max(
        state.effectiveRentalRevenueKrw +
          state.otherIncomeKrw -
          state.annualOpexKrw -
          state.annualCapexReserveKrw,
        state.annualOpexKrw * 0.2
      ),
    scenario: (state, input) => {
      const scenarioOccupancyPct = Math.min(
        90,
        Math.max(35, state.adjustedOccupancyPct + input.occupancyBumpPct)
      );
      const scenarioCapRatePct = Math.max(4.75, state.capRatePct + input.capRateShiftPct);
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

export const hotelRiskConfig: RiskConfig = {
  vacancyThreshold: 12,
  vacancyHighRisk:
    'Soft demand in the submarket pressures RevPAR through lower occupancy and ADR discounting.',
  vacancyFallbackRisk:
    'Occupancy, ADR, and RevPAR assumptions still need STR-style benchmarking before committee review.',
  comparablePresentRisk:
    'Hotel comparable pricing is available, but it should be refreshed with recent trades and trading performance.',
  comparableMarketRisk:
    'Raw hospitality market comps are loaded, but curated weighting should still be reviewed before committee.',
  comparableMissingRisk:
    'No hotel comparable set is loaded yet, so valuation still relies on fallback pricing heuristics.',
  entryDefinedRisk:
    'Entry basis is captured, but the operating statements, ADR/RevPAR build, and GOP margin still need validation.',
  entryMissingRisk:
    'Entry pricing remains provisional and should be reconciled against recent hotel transactions.',
  capexDefinedRisk:
    'PIP/brand-standard capex, FF&E reserve, and renovation timing should be validated against the franchise/management agreement.',
  capexMissingRisk:
    'FF&E reserve, PIP, and brand-standard capex remain under-specified for the current screen.',
  leverageThresholdRatio: 0.55,
  leverageHighRisk:
    'Leverage is aggressive for an operating hotel and should be stress-tested against a RevPAR downturn.',
  leverageFallbackRisk:
    'Debt sizing is still high-level and should be reconciled against lender DSCR covenants for hospitality.',
  extraRisks: [
    'Operator and management/franchise agreement terms (brand/flag, fees, performance tests) drive realizable GOP margin and must be diligenced.',
    'Seasonality and event/demand concentration expose RevPAR to volatility; stress monthly trading, not just annual averages.',
    'F&B and ancillary departments carry their own cost structures and labor risk that should be modeled separately from rooms.'
  ]
};

export const hotelDdChecklistBase = [
  'Load the trailing STR/benchmarking data: occupancy, ADR, and RevPAR versus the competitive set.',
  'Validate departmental P&L (rooms, F&B, other) and the GOP margin against operator budgets.',
  'Confirm the management/franchise (brand/flag) agreement terms, fees, and performance tests.',
  'Review the FF&E reserve, outstanding PIP/brand-standard capex, and renovation timeline.'
];

export const hotelProvenanceConfig: ProvenanceConfig = {
  rentableArea: {
    fallbackSourceSystem: 'gross-area-fallback',
    intakeLabel: 'hotel intake'
  }
};

export async function buildHotelValuationAnalysis(
  bundle: UnderwritingBundle,
  context: ValuationStrategyContext = {}
): Promise<UnderwritingAnalysis> {
  const valuation = buildStabilizedIncomeValuation(bundle, context, buildHotelValuationConfig());
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
    keyRisks: buildStabilizedIncomeKeyRisks(bundle, valuation, hotelRiskConfig),
    ddChecklist: buildStabilizedIncomeDdChecklist(hotelDdChecklistBase, debtDdChecklistItem),
    assumptions: buildStabilizedIncomeAssumptions(
      'HOTEL',
      valuation,
      bundle.comparableSet?.entries.length ?? 0
    ),
    provenance: buildStabilizedIncomeProvenance(bundle, valuation, hotelProvenanceConfig),
    scenarios: valuation.scenarios
  };

  const finalized = applyCreditOverlay(analysis, bundle, valuation.confidenceBounds);
  finalized.underwritingMemo = await generateUnderwritingMemo(finalized);

  return finalized;
}
