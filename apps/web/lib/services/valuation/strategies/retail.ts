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
    occupancyBumpPct: 4,
    capRateShiftPct: -0.35,
    noiFactor: 1.05,
    note: 'Footfall and tenant sales remain firm, tightening retail exit pricing modestly.'
  },
  {
    name: 'Base',
    scenarioOrder: 1,
    occupancyBumpPct: 0,
    capRateShiftPct: 0,
    noiFactor: 1,
    note: 'Base case screening for a stabilized retail asset using occupancy and market exit yield assumptions.'
  },
  {
    name: 'Bear',
    scenarioOrder: 2,
    occupancyBumpPct: -9,
    capRateShiftPct: 0.7,
    noiFactor: 0.88,
    note: 'Tenant rollover weakens, downtime expands, and yields move out against the underwriting case.'
  }
];

export async function buildRetailValuationAnalysis(
  bundle: UnderwritingBundle,
  context: ValuationStrategyContext = {}
): Promise<UnderwritingAnalysis> {
  const valuation = buildStabilizedIncomeValuation(bundle, context, {
    defaultRentableAreaSqm: 12000,
    occupancy: {
      floorPct: 50,
      ceilingPct: 100,
      fallbackPct: 90,
      scenarioFloorPct: 42,
      scenarioCeilingPct: 98
    },
    capRate: {
      floorPct: 4.5,
      fallbackPct: 6.1,
      scenarioFloorPct: 4.25
    },
    purchaseFallbackPerSqmKrw: 4_100_000,
    debtLtvDefaultPct: 52,
    debtCostFloorPct: 3.6,
    debtCostFallbackPct: 5.3,
    debtServiceSpreadPct: 1.2,
    confidence: {
      floor: 4.8,
      ceiling: 8.9,
      base: 5,
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
      Math.max(state.rentableAreaSqm * 12 * Math.max(state.adjustedOccupancyPct / 100, 0.55), 1),
    creditLossPct: () => 1.8,
    vacancyAllowancePct: (state) => Math.max(100 - state.adjustedOccupancyPct, 5),
    effectiveRentalRevenueKrw: (state) =>
      state.grossPotentialRentKrw *
      Math.max(0.5, state.adjustedOccupancyPct / 100) *
      Math.max(0.72, 1 - (state.vacancyAllowancePct + state.creditLossPct) / 100),
    otherIncomeKrw: (state) => state.grossPotentialRentKrw * 0.03,
    annualOpexKrw: (state) => state.bundle.asset.opexAssumptionKrw ?? state.grossPotentialRentKrw * 0.22,
    annualCapexReserveKrw: (state) =>
      state.bundle.asset.capexAssumptionKrw
        ? state.bundle.asset.capexAssumptionKrw * 0.04
        : state.grossPotentialRentKrw * 0.01,
    stabilizedNoiKrw: (state) =>
      Math.max(
        state.effectiveRentalRevenueKrw + state.otherIncomeKrw - state.annualOpexKrw - state.annualCapexReserveKrw,
        state.annualOpexKrw * 1.15
      ),
    scenario: (state, input) => {
      const scenarioOccupancyPct = Math.min(100, Math.max(42, state.adjustedOccupancyPct + input.occupancyBumpPct));
      const scenarioCapRatePct = Math.max(4.25, state.capRatePct + input.capRateShiftPct);
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
      bundle.marketSnapshot?.vacancyPct != null && bundle.marketSnapshot.vacancyPct > 12
        ? 'Retail vacancy is elevated in the target submarket and could pressure downtime and rent reversions.'
        : 'Retail occupancy and rollover still need tenant-level support before committee review.',
      valuation.comparableValuePerSqm
        ? 'Retail comparable pricing is available, but it should be refreshed with recent trades and leasing evidence.'
        : valuation.marketEvidence.transactionCompCount > 0
          ? 'Raw retail market comps are loaded, but curated weighting should still be reviewed before committee.'
          : 'No retail comparable set is loaded yet, so valuation still relies on fallback pricing heuristics.',
      bundle.asset.purchasePriceKrw
        ? 'Entry basis is defined, but rent roll, co-tenancy, and tenant sales exposure still need validation.'
        : 'Entry pricing remains provisional and should be reconciled against broker guidance and recent center trades.',
      bundle.asset.capexAssumptionKrw
        ? 'Capex timing, facade/common-area upgrades, and re-tenanting costs should be validated.'
        : 'Re-tenanting capex and leasing downtime remain under-specified for the current screen.',
      valuation.debtPrincipalKrw > 0.58 * valuation.purchasePriceKrw
        ? 'Leverage is high for a first-pass retail screen and should be tested against downside occupancy.'
        : 'Debt sizing is still high-level and should be replaced with lender-specific terms and covenants.'
    ],
    ddChecklist: [
      'Load the rent roll, anchor exposure, and near-term lease rollover schedule.',
      'Validate in-line rent levels, occupancy costs, and tenant sales sensitivity where relevant.',
      'Confirm common-area maintenance, taxes, and landlord recoveries.',
      'Review re-tenanting capex, leasing downtime, and co-tenancy risk.',
      'Replace synthetic debt sizing with lender terms, reserves, and DSCR covenants.'
    ],
    assumptions: {
      assetClass: 'RETAIL',
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
        intakeLabel: 'retail intake'
      }
    }),
    scenarios: valuation.scenarios
  };

  const finalized = applyCreditOverlay(analysis, bundle);
  finalized.underwritingMemo = await generateUnderwritingMemo(finalized);

  return finalized;
}
