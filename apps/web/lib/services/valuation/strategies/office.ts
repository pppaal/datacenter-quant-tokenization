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
    noiFactor: 1.06,
    note: 'Lease-up exceeds the underwriting case and exit pricing compresses modestly.'
  },
  {
    name: 'Base',
    scenarioOrder: 1,
    occupancyBumpPct: 0,
    capRateShiftPct: 0,
    noiFactor: 1,
    note: 'Base case screening using stabilized occupancy, market cap rate, and current leverage assumptions.'
  },
  {
    name: 'Bear',
    scenarioOrder: 2,
    occupancyBumpPct: -8,
    capRateShiftPct: 0.6,
    noiFactor: 0.9,
    note: 'Occupancy softens, operating leakage widens, and exit pricing moves against the deal.'
  }
];

export async function buildOfficeValuationAnalysis(
  bundle: UnderwritingBundle,
  context: ValuationStrategyContext = {}
): Promise<UnderwritingAnalysis> {
  const valuation = buildStabilizedIncomeValuation(bundle, context, {
    defaultRentableAreaSqm: 10000,
    occupancy: {
      floorPct: 55,
      ceilingPct: 100,
      fallbackPct: 92,
      scenarioFloorPct: 45,
      scenarioCeilingPct: 98
    },
    capRate: {
      floorPct: 3.5,
      fallbackPct: 5.5,
      scenarioFloorPct: 3.25
    },
    purchaseFallbackPerSqmKrw: 5_500_000,
    debtLtvDefaultPct: 55,
    debtCostFloorPct: 3.5,
    debtCostFallbackPct: 5.2,
    debtServiceSpreadPct: 1.25,
    confidence: {
      floor: 4.8,
      ceiling: 9.2,
      base: 5.1,
      comparableThreshold: 3,
      comparableBonus: 0.9,
      transactionCompBonus: 0.4,
      rentCompBonus: 0.35,
      purchaseBonus: 0.4,
      stabilizedOccupancyBonus: 0.35,
      extraBonus: (state) =>
        (state.bundle.officeDetail?.stabilizedRentPerSqmMonthKrw ? 0.35 : 0) +
        (state.bundle.officeDetail?.weightedAverageLeaseTermYears ? 0.2 : 0)
    },
    scenarioInputs,
    monthlyRentPerSqmKrw: (state) =>
      Math.max(
        state.bundle.officeDetail?.stabilizedRentPerSqmMonthKrw ?? state.marketEvidence.averageMonthlyRentPerSqmKrw ?? 0,
        ((state.marketValueProxyKrw ?? state.bundle.asset.purchasePriceKrw ?? 0) * (state.capRatePct / 100)) /
          Math.max(
            state.rentableAreaSqm * 12 * Math.max(state.adjustedOccupancyPct / 100, 0.5),
            1
          )
      ),
    creditLossPct: (state) => state.bundle.officeDetail?.creditLossPct ?? 1.5,
    vacancyAllowancePct: (state) =>
      state.bundle.officeDetail?.vacancyAllowancePct ?? Math.max(100 - state.adjustedOccupancyPct, 4),
    effectiveRentalRevenueKrw: (state) =>
      state.grossPotentialRentKrw *
      Math.max(0.45, state.adjustedOccupancyPct / 100) *
      Math.max(0.7, 1 - (state.vacancyAllowancePct + state.creditLossPct) / 100),
    otherIncomeKrw: (state) => state.bundle.officeDetail?.otherIncomeKrw ?? state.grossPotentialRentKrw * 0.02,
    annualOpexKrw: (state) => state.bundle.asset.opexAssumptionKrw ?? state.grossPotentialRentKrw * 0.18,
    annualCapexReserveKrw: (state) =>
      state.bundle.officeDetail?.annualCapexReserveKrw ?? state.grossPotentialRentKrw * 0.008,
    tenantImprovementReserveKrw: (state) =>
      state.bundle.officeDetail?.tenantImprovementReserveKrw ?? state.grossPotentialRentKrw * 0.025,
    leasingCommissionReserveKrw: (state) =>
      state.bundle.officeDetail?.leasingCommissionReserveKrw ?? state.grossPotentialRentKrw * 0.012,
    stabilizedNoiKrw: (state) =>
      Math.max(
        state.effectiveRentalRevenueKrw +
          state.otherIncomeKrw -
          state.annualOpexKrw -
          (state.tenantImprovementReserveKrw ?? 0) -
          (state.leasingCommissionReserveKrw ?? 0) -
          state.annualCapexReserveKrw,
        state.annualOpexKrw * 1.15
      ),
    scenario: (state, input) => {
      const scenarioOccupancyPct = Math.min(100, Math.max(45, state.adjustedOccupancyPct + input.occupancyBumpPct));
      const scenarioCapRatePct = Math.max(3.25, state.capRatePct + input.capRateShiftPct);
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
      bundle.marketSnapshot?.vacancyPct != null && bundle.marketSnapshot.vacancyPct > 10
        ? 'Leasing velocity is exposed to soft office vacancy in the target submarket.'
        : 'Tenant rollover and lease-up assumptions still need submarket-tested support.',
      bundle.officeDetail?.weightedAverageLeaseTermYears && bundle.officeDetail.weightedAverageLeaseTermYears < 3
        ? 'Short WALT increases near-term rollover risk and could pressure downtime and TI spend.'
        : 'Lease rollover should still be reconciled against a tenant-by-tenant schedule before committee.',
      valuation.comparableValuePerSqm
        ? 'Comparable pricing exists but should be refreshed with recent office transactions before committee.'
        : valuation.marketEvidence.transactionCompCount > 0
          ? 'Raw market transaction comps are loaded, but curated weighting should still be reviewed before committee.'
          : 'No office comparable matrix is loaded yet, so valuation still leans on fallback pricing heuristics.',
      bundle.asset.purchasePriceKrw
        ? 'Entry basis is captured, but rent roll and operating statements still need to validate the implied cap rate.'
        : 'Purchase basis is not finalized, so downside protection depends on assumed market pricing.',
      valuation.debtPrincipalKrw > 0.6 * valuation.purchasePriceKrw
        ? 'Leverage is aggressive for a first-pass office screen and should be stress-tested against lower NOI.'
        : 'Debt sizing is still high-level and should be reconciled against lender-specific covenants and amortization.',
      bundle.permitSnapshot?.permitStage
        ? `Permitting status is ${bundle.permitSnapshot.permitStage}, and timeline drift should be checked against the business plan.`
        : 'Asset-level permit and physical-condition diligence remain incomplete for the current screen.'
    ],
    ddChecklist: [
      'Load the current rent roll, weighted average lease term, and top-tenant concentration.',
      'Confirm normalized opex with trailing statements and one-off repair adjustments.',
      'Refresh office transaction comps and submarket cap-rate evidence.',
      'Validate capital plan timing, tenant-improvement exposure, leasing commissions, and downtime assumptions.',
      'Replace placeholder debt sizing with lender terms, amortization, reserves, and DSCR covenants.'
    ],
    assumptions: {
      assetClass: 'OFFICE',
      rentableAreaSqm: valuation.rentableAreaSqm,
      occupancyPct: Number(valuation.adjustedOccupancyPct.toFixed(2)),
      monthlyRentPerSqmKrw: roundKrw(valuation.monthlyRentPerSqmKrw),
      grossPotentialRentKrw: roundKrw(valuation.grossPotentialRentKrw),
      effectiveRentalRevenueKrw: roundKrw(valuation.effectiveRentalRevenueKrw),
      otherIncomeKrw: roundKrw(valuation.otherIncomeKrw),
      purchasePriceKrw: roundKrw(valuation.purchasePriceKrw),
      annualOpexKrw: roundKrw(valuation.annualOpexKrw),
      tenantImprovementReserveKrw: roundKrw(valuation.tenantImprovementReserveKrw ?? 0),
      leasingCommissionReserveKrw: roundKrw(valuation.leasingCommissionReserveKrw ?? 0),
      annualCapexReserveKrw: roundKrw(valuation.annualCapexReserveKrw),
      stabilizedNoiKrw: roundKrw(valuation.stabilizedNoiKrw),
      capRatePct: Number(valuation.capRatePct.toFixed(2)),
      debtLtvPct: Number(valuation.debtLtvPct.toFixed(2)),
      debtCostPct: Number(valuation.debtCostPct.toFixed(2)),
      vacancyAllowancePct: Number(valuation.vacancyAllowancePct.toFixed(2)),
      creditLossPct: Number(valuation.creditLossPct.toFixed(2)),
      weightedAverageLeaseTermYears: bundle.officeDetail?.weightedAverageLeaseTermYears ?? null,
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
        fallbackSourceSystem: 'building-snapshot-fallback',
        intakeLabel: 'office intake'
      },
      occupancy: {
        field: 'occupancyPct',
        value: bundle.asset.stabilizedOccupancyPct ?? bundle.asset.occupancyAssumptionPct ?? null,
        sourceSystem: 'asset-intake',
        fallbackSourceSystem: 'market-vacancy-fallback',
        freshnessLabel: 'stabilized occupancy',
        fallbackFreshnessLabel: 'vacancy-derived fallback'
      },
      rent: {
        field: 'stabilizedRentPerSqmMonthKrw',
        value: bundle.officeDetail?.stabilizedRentPerSqmMonthKrw ?? valuation.marketEvidence.averageMonthlyRentPerSqmKrw ?? null,
        sourceSystem: bundle.officeDetail?.stabilizedRentPerSqmMonthKrw ? 'office-detail' : 'global-market-api',
        fallbackSourceSystem: 'fallback-rent-proxy',
        freshnessLabel: bundle.officeDetail?.stabilizedRentPerSqmMonthKrw ? 'office intake' : 'market rent comps',
        fallbackFreshnessLabel: 'proxy',
        hasPrimaryValue:
          bundle.officeDetail?.stabilizedRentPerSqmMonthKrw != null ||
          valuation.marketEvidence.averageMonthlyRentPerSqmKrw != null
      }
    }),
    scenarios: valuation.scenarios
  };

  const finalized = applyCreditOverlay(analysis, bundle);
  finalized.underwritingMemo = await generateUnderwritingMemo(finalized);

  return finalized;
}
