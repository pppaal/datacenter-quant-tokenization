import { generateUnderwritingMemo } from '@/lib/ai/openai';
import { applyCreditOverlay } from '@/lib/services/valuation/credit-overlay';
import { pickBaseScenario } from '@/lib/services/valuation/scenario-utils';
import {
  buildStabilizedIncomeProvenance,
  buildStabilizedIncomeValuation,
  type StabilizedIncomeScenarioInput,
  type StabilizedIncomeValuation
} from '@/lib/services/valuation/stabilized-income';
import type {
  UnderwritingAnalysis,
  UnderwritingBundle,
  ValuationStrategyContext
} from '@/lib/services/valuation/types';
import { roundKrw } from '@/lib/services/valuation/utils';

const scenarioInputs: StabilizedIncomeScenarioInput[] = [
  {
    name: 'Bull',
    scenarioOrder: 0,
    occupancyBumpPct: 3,
    capRateShiftPct: -0.3,
    noiFactor: 1.04,
    note: 'Take-up stays firm and logistics yields compress on stronger institutional demand.'
  },
  {
    name: 'Base',
    scenarioOrder: 1,
    occupancyBumpPct: 0,
    capRateShiftPct: 0,
    noiFactor: 1,
    note: 'Base case screening for a stabilized industrial/logistics asset.'
  },
  {
    name: 'Bear',
    scenarioOrder: 2,
    occupancyBumpPct: -6,
    capRateShiftPct: 0.55,
    noiFactor: 0.9,
    note: 'Leasing softens, downtime expands, and exit yields widen against the entry case.'
  }
];

export async function buildIndustrialValuationAnalysis(
  bundle: UnderwritingBundle,
  context: ValuationStrategyContext = {}
): Promise<UnderwritingAnalysis> {
  const valuation = buildStabilizedIncomeValuation(bundle, context, {
    defaultRentableAreaSqm: 16000,
    occupancy: {
      floorPct: 60,
      ceilingPct: 100,
      fallbackPct: 93,
      scenarioFloorPct: 50,
      scenarioCeilingPct: 98
    },
    capRate: {
      floorPct: 4,
      fallbackPct: 5.4,
      scenarioFloorPct: 3.75
    },
    purchaseFallbackPerSqmKrw: 4_400_000,
    debtLtvDefaultPct: 54,
    debtCostFloorPct: 3.6,
    debtCostFallbackPct: 5,
    debtServiceSpreadPct: 1.15,
    confidence: {
      floor: 4.8,
      ceiling: 9,
      base: 5.05,
      comparableThreshold: 2,
      comparableBonus: 0.75,
      transactionCompBonus: 0.35,
      rentCompBonus: 0.25,
      purchaseBonus: 0.4,
      stabilizedOccupancyBonus: 0.3
    },
    scenarioInputs,
    monthlyRentPerSqmKrw: (state) =>
      Math.max(
        state.marketEvidence.averageMonthlyRentPerSqmKrw ?? 0,
        ((state.marketValueProxyKrw ?? state.bundle.asset.purchasePriceKrw ?? 0) * (state.capRatePct / 100)) /
          Math.max(
            state.rentableAreaSqm * 12 * Math.max(state.adjustedOccupancyPct / 100, 0.58),
            1
          )
      ),
    creditLossPct: () => 1.2,
    vacancyAllowancePct: (state) => Math.max(100 - state.adjustedOccupancyPct, 4),
    effectiveRentalRevenueKrw: (state) =>
      state.grossPotentialRentKrw *
      Math.max(0.55, state.adjustedOccupancyPct / 100) *
      Math.max(0.78, 1 - (state.vacancyAllowancePct + state.creditLossPct) / 100),
    otherIncomeKrw: (state) => state.grossPotentialRentKrw * 0.015,
    annualOpexKrw: (state) => state.bundle.asset.opexAssumptionKrw ?? state.grossPotentialRentKrw * 0.16,
    annualCapexReserveKrw: (state) =>
      state.bundle.asset.capexAssumptionKrw ? state.bundle.asset.capexAssumptionKrw * 0.035 : state.grossPotentialRentKrw * 0.007,
    stabilizedNoiKrw: (state) =>
      Math.max(
        state.effectiveRentalRevenueKrw +
          state.otherIncomeKrw -
          state.annualOpexKrw -
          state.annualCapexReserveKrw,
        state.annualOpexKrw * 1.12
      ),
    scenario: (state, input) => {
      const scenarioOccupancyPct = Math.min(98, Math.max(50, state.adjustedOccupancyPct + input.occupancyBumpPct));
      const scenarioCapRatePct = Math.max(3.75, state.capRatePct + input.capRateShiftPct);
      const scenarioNoiKrw =
        state.stabilizedNoiKrw * input.noiFactor * (scenarioOccupancyPct / state.adjustedOccupancyPct);
      const valuationKrw = scenarioNoiKrw / (scenarioCapRatePct / 100);

      return {
        valuationKrw,
        impliedYieldPct: (scenarioNoiKrw / valuationKrw) * 100,
        exitCapRatePct: scenarioCapRatePct,
        debtServiceCoverage: scenarioNoiKrw / state.annualDebtServiceKrw
      };
    }
  });

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
    keyRisks: [
      bundle.marketSnapshot?.vacancyPct != null && bundle.marketSnapshot.vacancyPct > 7
        ? 'Logistics vacancy is moving higher in the target corridor and could pressure lease-up.'
        : 'Occupancy assumptions still need lease-by-lease support before committee review.',
      valuation.comparableValuePerSqm
        ? 'Comparable logistics pricing is available, but it should be refreshed with recent corridor trades.'
        : valuation.marketEvidence.transactionCompCount > 0
          ? 'Raw industrial transaction comps are loaded, but curated weighting should still be reviewed before committee.'
          : 'No industrial comparable set is loaded yet, so valuation still relies on fallback pricing heuristics.',
      bundle.asset.purchasePriceKrw
        ? 'Entry basis is defined, but tenant rollover and downtime assumptions still need validation.'
        : 'Entry pricing remains provisional and should be reconciled against broker guidance and recent warehouse trades.',
      bundle.asset.capexAssumptionKrw
        ? 'Dock, yard, and reconfiguration capex should be validated against the business plan.'
        : 'Re-tenanting and modernization capex remain under-specified for the current screen.',
      valuation.debtPrincipalKrw > 0.58 * valuation.purchasePriceKrw
        ? 'Leverage is high for a first-pass logistics screen and should be tested against downside occupancy.'
        : 'Debt sizing is still high-level and should be replaced with lender-specific terms and covenants.'
    ],
    ddChecklist: [
      'Load the rent roll, tenant concentration, and rollover schedule.',
      'Validate logistics rent levels, downtime, and free-rent assumptions against live corridor comps.',
      'Confirm normalized opex, recoveries, and landlord capital obligations.',
      'Review loading, yard, and building-spec competitiveness versus competing stock.',
      'Replace synthetic debt sizing with lender terms, reserves, and DSCR covenants.'
    ],
    assumptions: {
      assetClass: 'INDUSTRIAL',
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
      creditLossPct: Number(valuation.creditLossPct.toFixed(2)),
      comparableEntryCount: bundle.comparableSet?.entries.length ?? 0,
      comparableValuePerSqmKrw: valuation.comparableValuePerSqm ? roundKrw(valuation.comparableValuePerSqm) : null,
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
      macroRegime: valuation.macroRegime
    },
    provenance: buildStabilizedIncomeProvenance(bundle, valuation, {
      rentableArea: {
        fallbackSourceSystem: 'gross-area-fallback',
        intakeLabel: 'industrial intake'
      }
    }),
    scenarios: valuation.scenarios
  };

  const finalized = applyCreditOverlay(analysis, bundle);
  finalized.underwritingMemo = await generateUnderwritingMemo(finalized);

  return finalized;
}
