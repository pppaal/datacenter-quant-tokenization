import {
  buildStabilizedIncomeProvenance,
  buildStabilizedIncomeValuation,
  type StabilizedIncomeScenarioInput,
  type StabilizedIncomeValuation
} from '@/lib/services/valuation/stabilized-income';
import type { UnderwritingBundle } from '@/lib/services/valuation/types';
import { roundKrw } from '@/lib/services/valuation/utils';

type ValuationConfig = Parameters<typeof buildStabilizedIncomeValuation>[2];
type RiskConfig = Parameters<typeof import('@/lib/services/valuation/stabilized-income').buildStabilizedIncomeKeyRisks>[2];
type ProvenanceConfig = Parameters<typeof buildStabilizedIncomeProvenance>[2];

export const officeScenarioInputs: StabilizedIncomeScenarioInput[] = [
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

export const industrialScenarioInputs: StabilizedIncomeScenarioInput[] = [
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

export const retailScenarioInputs: StabilizedIncomeScenarioInput[] = [
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

export const multifamilyScenarioInputs: StabilizedIncomeScenarioInput[] = [
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

export function buildOfficeValuationConfig(): ValuationConfig {
  return {
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
    scenarioInputs: officeScenarioInputs,
    monthlyRentPerSqmKrw: (state) =>
      Math.max(
        state.bundle.officeDetail?.stabilizedRentPerSqmMonthKrw ?? state.marketEvidence.averageMonthlyRentPerSqmKrw ?? 0,
        ((state.marketValueProxyKrw ?? state.bundle.asset.purchasePriceKrw ?? 0) * (state.capRatePct / 100)) /
          Math.max(state.rentableAreaSqm * 12 * Math.max(state.adjustedOccupancyPct / 100, 0.5), 1)
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
  };
}

export function buildIndustrialValuationConfig(): ValuationConfig {
  return {
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
    scenarioInputs: industrialScenarioInputs,
    monthlyRentPerSqmKrw: (state) =>
      Math.max(
        state.marketEvidence.averageMonthlyRentPerSqmKrw ?? 0,
        ((state.marketValueProxyKrw ?? state.bundle.asset.purchasePriceKrw ?? 0) * (state.capRatePct / 100)) /
          Math.max(state.rentableAreaSqm * 12 * Math.max(state.adjustedOccupancyPct / 100, 0.58), 1)
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
        state.effectiveRentalRevenueKrw + state.otherIncomeKrw - state.annualOpexKrw - state.annualCapexReserveKrw,
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
  };
}

export function buildRetailValuationConfig(): ValuationConfig {
  return {
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
    scenarioInputs: retailScenarioInputs,
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
  };
}

export function buildMultifamilyValuationConfig(): ValuationConfig {
  return {
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
    scenarioInputs: multifamilyScenarioInputs,
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
  };
}

export function buildOfficeRiskConfig(bundle: UnderwritingBundle): RiskConfig {
  return {
    vacancyThreshold: 10,
    vacancyHighRisk: 'Leasing velocity is exposed to soft office vacancy in the target submarket.',
    vacancyFallbackRisk: 'Tenant rollover and lease-up assumptions still need submarket-tested support.',
    comparablePresentRisk: 'Comparable pricing exists but should be refreshed with recent office transactions before committee.',
    comparableMarketRisk:
      'Raw market transaction comps are loaded, but curated weighting should still be reviewed before committee.',
    comparableMissingRisk:
      'No office comparable matrix is loaded yet, so valuation still leans on fallback pricing heuristics.',
    entryDefinedRisk:
      'Entry basis is captured, but rent roll and operating statements still need to validate the implied cap rate.',
    entryMissingRisk: 'Purchase basis is not finalized, so downside protection depends on assumed market pricing.',
    capexDefinedRisk:
      'Capital plan timing, tenant-improvement exposure, leasing commissions, and downtime assumptions should be validated.',
    capexMissingRisk: 'Capital plan and leasing cost assumptions remain under-specified for the current screen.',
    leverageThresholdRatio: 0.6,
    leverageHighRisk:
      'Leverage is aggressive for a first-pass office screen and should be stress-tested against lower NOI.',
    leverageFallbackRisk:
      'Debt sizing is still high-level and should be reconciled against lender-specific covenants and amortization.',
    extraRisks: [
      bundle.officeDetail?.weightedAverageLeaseTermYears && bundle.officeDetail.weightedAverageLeaseTermYears < 3
        ? 'Short WALT increases near-term rollover risk and could pressure downtime and TI spend.'
        : 'Lease rollover should still be reconciled against a tenant-by-tenant schedule before committee.',
      bundle.permitSnapshot?.permitStage
        ? `Permitting status is ${bundle.permitSnapshot.permitStage}, and timeline drift should be checked against the business plan.`
        : 'Asset-level permit and physical-condition diligence remain incomplete for the current screen.'
    ]
  };
}

export const industrialRiskConfig: RiskConfig = {
  vacancyThreshold: 7,
  vacancyHighRisk: 'Logistics vacancy is moving higher in the target corridor and could pressure lease-up.',
  vacancyFallbackRisk: 'Occupancy assumptions still need lease-by-lease support before committee review.',
  comparablePresentRisk: 'Comparable logistics pricing is available, but it should be refreshed with recent corridor trades.',
  comparableMarketRisk:
    'Raw industrial transaction comps are loaded, but curated weighting should still be reviewed before committee.',
  comparableMissingRisk:
    'No industrial comparable set is loaded yet, so valuation still relies on fallback pricing heuristics.',
  entryDefinedRisk: 'Entry basis is defined, but tenant rollover and downtime assumptions still need validation.',
  entryMissingRisk:
    'Entry pricing remains provisional and should be reconciled against broker guidance and recent warehouse trades.',
  capexDefinedRisk: 'Dock, yard, and reconfiguration capex should be validated against the business plan.',
  capexMissingRisk: 'Re-tenanting and modernization capex remain under-specified for the current screen.',
  leverageThresholdRatio: 0.58,
  leverageHighRisk: 'Leverage is high for a first-pass logistics screen and should be tested against downside occupancy.',
  leverageFallbackRisk:
    'Debt sizing is still high-level and should be replaced with lender-specific terms and covenants.'
};

export const retailRiskConfig: RiskConfig = {
  vacancyThreshold: 12,
  vacancyHighRisk: 'Retail vacancy is elevated in the target submarket and could pressure downtime and rent reversions.',
  vacancyFallbackRisk: 'Retail occupancy and rollover still need tenant-level support before committee review.',
  comparablePresentRisk:
    'Retail comparable pricing is available, but it should be refreshed with recent trades and leasing evidence.',
  comparableMarketRisk:
    'Raw retail market comps are loaded, but curated weighting should still be reviewed before committee.',
  comparableMissingRisk:
    'No retail comparable set is loaded yet, so valuation still relies on fallback pricing heuristics.',
  entryDefinedRisk:
    'Entry basis is defined, but rent roll, co-tenancy, and tenant sales exposure still need validation.',
  entryMissingRisk:
    'Entry pricing remains provisional and should be reconciled against broker guidance and recent center trades.',
  capexDefinedRisk: 'Capex timing, facade/common-area upgrades, and re-tenanting costs should be validated.',
  capexMissingRisk: 'Re-tenanting capex and leasing downtime remain under-specified for the current screen.',
  leverageThresholdRatio: 0.58,
  leverageHighRisk: 'Leverage is high for a first-pass retail screen and should be tested against downside occupancy.',
  leverageFallbackRisk:
    'Debt sizing is still high-level and should be replaced with lender-specific terms and covenants.'
};

export const multifamilyRiskConfig: RiskConfig = {
  vacancyThreshold: 7,
  vacancyHighRisk:
    'Residential vacancy is elevated relative to the target multifamily case and could pressure rent growth.',
  vacancyFallbackRisk: 'Occupancy and rent growth assumptions still need property-level support before committee review.',
  comparablePresentRisk:
    'Multifamily pricing evidence is available, but it should be refreshed with recent apartment trades.',
  comparableMarketRisk:
    'Raw multifamily market comps are loaded, but curated weighting should still be reviewed before committee.',
  comparableMissingRisk:
    'No multifamily comparable set is loaded yet, so valuation still relies on fallback pricing heuristics.',
  entryDefinedRisk:
    'Entry basis is defined, but rent roll, concessions, and turnover assumptions still need validation.',
  entryMissingRisk: 'Entry pricing remains provisional and should be reconciled against recent residential trades.',
  capexDefinedRisk: 'Interior turn costs, amenity refresh, and deferred maintenance should be validated.',
  capexMissingRisk: 'Turnover capex and maintenance reserves remain under-specified for the current screen.',
  leverageThresholdRatio: 0.58,
  leverageHighRisk:
    'Leverage is high for a first-pass multifamily screen and should be tested against softer occupancy.',
  leverageFallbackRisk:
    'Debt sizing is still high-level and should be replaced with lender-specific terms and covenants.'
};

export const officeDdChecklistBase = [
  'Load the current rent roll, weighted average lease term, and top-tenant concentration.',
  'Confirm normalized opex with trailing statements and one-off repair adjustments.',
  'Refresh office transaction comps and submarket cap-rate evidence.',
  'Validate capital plan timing, tenant-improvement exposure, leasing commissions, and downtime assumptions.'
];

export const industrialDdChecklistBase = [
  'Load the rent roll, tenant concentration, and rollover schedule.',
  'Validate logistics rent levels, downtime, and free-rent assumptions against live corridor comps.',
  'Confirm normalized opex, recoveries, and landlord capital obligations.',
  'Review loading, yard, and building-spec competitiveness versus competing stock.'
];

export const retailDdChecklistBase = [
  'Load the rent roll, anchor exposure, and near-term lease rollover schedule.',
  'Validate in-line rent levels, occupancy costs, and tenant sales sensitivity where relevant.',
  'Confirm common-area maintenance, taxes, and landlord recoveries.',
  'Review re-tenanting capex, leasing downtime, and co-tenancy risk.'
];

export const multifamilyDdChecklistBase = [
  'Load the current rent roll, lease expiries, and tenant turnover history.',
  'Validate market rents, concessions, and renewal assumptions for the submarket.',
  'Confirm recoverable and non-recoverable opex, taxes, and insurance.',
  'Review unit-turn capex, amenity refresh needs, and deferred maintenance.'
];

export const debtDdChecklistItem =
  'Replace synthetic debt sizing with lender terms, reserves, and DSCR covenants.';

export function buildOfficeAssumptionExtras(bundle: UnderwritingBundle, valuation: StabilizedIncomeValuation) {
  return {
    tenantImprovementReserveKrw: roundKrw(valuation.tenantImprovementReserveKrw ?? 0),
    leasingCommissionReserveKrw: roundKrw(valuation.leasingCommissionReserveKrw ?? 0),
    weightedAverageLeaseTermYears: bundle.officeDetail?.weightedAverageLeaseTermYears ?? null
  };
}

export function buildOfficeProvenanceConfig(
  bundle: UnderwritingBundle,
  valuation: StabilizedIncomeValuation
): ProvenanceConfig {
  return {
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
  };
}

export const industrialProvenanceConfig: ProvenanceConfig = {
  rentableArea: {
    fallbackSourceSystem: 'gross-area-fallback',
    intakeLabel: 'industrial intake'
  }
};

export const retailProvenanceConfig: ProvenanceConfig = {
  rentableArea: {
    fallbackSourceSystem: 'gross-area-fallback',
    intakeLabel: 'retail intake'
  }
};

export const multifamilyProvenanceConfig: ProvenanceConfig = {
  rentableArea: {
    fallbackSourceSystem: 'gross-area-fallback',
    intakeLabel: 'multifamily intake'
  }
};
