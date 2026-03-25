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
    occupancyBumpPct: 2.5,
    capRateShiftPct: -0.25,
    noiFactor: 1.03,
    note: 'Lease-up stays firm and residential cap rates compress modestly on stronger demand.'
  },
  {
    name: 'Base',
    scenarioOrder: 1,
    occupancyBumpPct: 0,
    capRateShiftPct: 0,
    noiFactor: 1,
    note: 'Base case screening for a stabilized multifamily asset.'
  },
  {
    name: 'Bear',
    scenarioOrder: 2,
    occupancyBumpPct: -5.5,
    capRateShiftPct: 0.5,
    noiFactor: 0.92,
    note: 'Rent growth slows, turnover increases, and exit pricing softens against the entry case.'
  }
];

export async function buildMultifamilyValuationAnalysis(
  bundle: UnderwritingBundle,
  context: ValuationStrategyContext = {}
): Promise<UnderwritingAnalysis> {
  const valuation = buildStabilizedIncomeValuation(bundle, context, {
    defaultRentableAreaSqm: 8000,
    occupancy: {
      floorPct: 78,
      ceilingPct: 100,
      fallbackPct: 95,
      scenarioFloorPct: 70,
      scenarioCeilingPct: 99
    },
    capRate: {
      floorPct: 3.75,
      fallbackPct: 4.9,
      scenarioFloorPct: 3.5
    },
    purchaseFallbackPerSqmKrw: 5_200_000,
    debtLtvDefaultPct: 53,
    debtCostFloorPct: 3.4,
    debtCostFallbackPct: 4.9,
    debtServiceSpreadPct: 1.05,
    confidence: {
      floor: 5,
      ceiling: 9.1,
      base: 5.15,
      comparableThreshold: 2,
      comparableBonus: 0.7,
      transactionCompBonus: 0.35,
      rentCompBonus: 0.3,
      purchaseBonus: 0.4,
      stabilizedOccupancyBonus: 0.25
    },
    scenarioInputs,
    monthlyRentPerSqmKrw: (state) =>
      (state.purchasePriceKrw * (state.capRatePct / 100)) /
      Math.max(state.rentableAreaSqm * 12 * Math.max(state.adjustedOccupancyPct / 100, 0.75), 1),
    creditLossPct: () => 0.8,
    vacancyAllowancePct: (state) => Math.max(100 - state.adjustedOccupancyPct, 3),
    effectiveRentalRevenueKrw: (state) =>
      state.grossPotentialRentKrw *
      Math.max(0.75, state.adjustedOccupancyPct / 100) *
      Math.max(0.84, 1 - (state.vacancyAllowancePct + state.creditLossPct) / 100),
    otherIncomeKrw: (state) => state.grossPotentialRentKrw * 0.025,
    annualOpexKrw: (state) => state.bundle.asset.opexAssumptionKrw ?? state.grossPotentialRentKrw * 0.17,
    annualCapexReserveKrw: (state) =>
      state.bundle.asset.capexAssumptionKrw
        ? state.bundle.asset.capexAssumptionKrw * 0.035
        : state.grossPotentialRentKrw * 0.008,
    stabilizedNoiKrw: (state) =>
      Math.max(
        state.effectiveRentalRevenueKrw + state.otherIncomeKrw - state.annualOpexKrw - state.annualCapexReserveKrw,
        state.annualOpexKrw * 1.12
      ),
    scenario: (state, input) => {
      const scenarioOccupancyPct = Math.min(100, Math.max(72, state.adjustedOccupancyPct + input.occupancyBumpPct));
      const scenarioCapRatePct = Math.max(3.5, state.capRatePct + input.capRateShiftPct);
      const scenarioNoiKrw = state.stabilizedNoiKrw * input.noiFactor * (scenarioOccupancyPct / state.adjustedOccupancyPct);
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
        ? 'Residential vacancy is elevated relative to the target multifamily case and could pressure rent growth.'
        : 'Occupancy and rent growth assumptions still need property-level support before committee review.',
      valuation.comparableValuePerSqm
        ? 'Multifamily pricing evidence is available, but it should be refreshed with recent apartment trades.'
        : valuation.marketEvidence.transactionCompCount > 0
          ? 'Raw multifamily market comps are loaded, but curated weighting should still be reviewed before committee.'
          : 'No multifamily comparable set is loaded yet, so valuation still relies on fallback pricing heuristics.',
      bundle.asset.purchasePriceKrw
        ? 'Entry basis is defined, but rent roll, concessions, and turnover assumptions still need validation.'
        : 'Entry pricing remains provisional and should be reconciled against recent residential trades.',
      bundle.asset.capexAssumptionKrw
        ? 'Interior turn costs, amenity refresh, and deferred maintenance should be validated.'
        : 'Turnover capex and maintenance reserves remain under-specified for the current screen.',
      valuation.debtPrincipalKrw > 0.58 * valuation.purchasePriceKrw
        ? 'Leverage is high for a first-pass multifamily screen and should be tested against softer occupancy.'
        : 'Debt sizing is still high-level and should be replaced with lender-specific terms and covenants.'
    ],
    ddChecklist: [
      'Load the current rent roll, lease expiries, and tenant turnover history.',
      'Validate market rents, concessions, and renewal assumptions for the submarket.',
      'Confirm recoverable and non-recoverable opex, taxes, and insurance.',
      'Review unit-turn capex, amenity refresh needs, and deferred maintenance.',
      'Replace synthetic debt sizing with lender terms, reserves, and DSCR covenants.'
    ],
    assumptions: {
      assetClass: 'MULTIFAMILY',
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
      creditLossPct: valuation.creditLossPct,
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
        intakeLabel: 'multifamily intake'
      }
    }),
    scenarios: valuation.scenarios
  };

  const finalized = applyCreditOverlay(analysis, bundle);
  finalized.underwritingMemo = await generateUnderwritingMemo(finalized);

  return finalized;
}
