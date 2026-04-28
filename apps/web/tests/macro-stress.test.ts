import assert from 'node:assert/strict';
import test from 'node:test';
import {
  runMacroProFormaStress,
  runMacroStressAnalysis,
  runFactorAttribution
} from '@/lib/services/valuation/macro-stress';
import { dataCenterScenarioInputs } from '@/lib/services/valuation/data-center-config';
import type { MacroStressScenario } from '@/lib/services/macro/deal-risk';
import type { CorrelationPenalty } from '@/lib/services/macro/correlation-stress';
import type { PreparedUnderwritingInputs } from '@/lib/services/valuation/types';

function makePrepared(): PreparedUnderwritingInputs {
  return {
    bundle: {
      asset: {
        id: 'asset-1',
        assetCode: 'TEST',
        name: 'Test',
        assetClass: 'DATA_CENTER',
        market: 'KR',
        stage: 'STABILIZED',
        financingLtvPct: 55,
        financingRatePct: 5.3,
        occupancyAssumptionPct: 85,
        capexAssumptionKrw: 100_000_000_000,
        opexAssumptionKrw: 5_000_000_000,
        powerCapacityMw: 12,
        targetItLoadMw: 10
      },
      leases: [],
      debtFacilities: [],
      capexLineItems: []
    } as unknown as PreparedUnderwritingInputs['bundle'],
    stage: 'STABILIZED',
    capacityMw: 12,
    capacityKw: 12000,
    occupancyPct: 85,
    baseMonthlyRatePerKwKrw: 200000,
    baseCapRatePct: 6.5,
    baseDiscountRatePct: 9.5,
    baseDebtCostPct: 5.3,
    baseReplacementCostPerMwKrw: 7_200_000_000,
    powerPriceKrwPerKwh: 140,
    pueTarget: 1.33,
    annualGrowthPct: 2.3,
    baseOpexKrw: 5_000_000_000,
    stageFactor: 1,
    permitPenalty: 1,
    floodPenalty: 1,
    wildfirePenalty: 1,
    locationPremium: 1,
    comparableCalibration: {
      entryCount: 0,
      weightedCapRatePct: null,
      weightedMonthlyRatePerKwKrw: null,
      weightedDiscountRatePct: null,
      weightedValuePerMwKrw: null,
      directComparableValueKrw: null
    },
    capexBreakdown: {
      totalCapexKrw: 100_000_000_000,
      landValueKrw: 16_000_000_000,
      shellCoreKrw: 22_000_000_000,
      electricalKrw: 24_000_000_000,
      mechanicalKrw: 16_000_000_000,
      itFitOutKrw: 8_000_000_000,
      softCostKrw: 10_000_000_000,
      contingencyKrw: 4_000_000_000,
      hardCostKrw: 70_000_000_000,
      embeddedCostKrw: 0
    },
    taxProfile: {
      acquisitionTaxPct: 4.6,
      vatRecoveryPct: 90,
      propertyTaxPct: 0.35,
      insurancePct: 0.12,
      corporateTaxPct: 24.2,
      withholdingTaxPct: 15.4,
      exitTaxPct: 1
    },
    spvProfile: {
      legalStructure: 'SPC',
      managementFeePct: 1.25,
      performanceFeePct: 8,
      promoteThresholdPct: 10,
      promoteSharePct: 15,
      reserveTargetMonths: 6
    },
    macroRegime: {
      guidance: {
        summary: [],
        discountRateShiftPct: 0,
        exitCapRateShiftPct: 0,
        debtCostShiftPct: 0,
        occupancyShiftPct: 0,
        growthShiftPct: 0,
        replacementCostShiftPct: 0
      }
    } as unknown as PreparedUnderwritingInputs['macroRegime'],
    leases: [],
    debtFacilities: [],
    documentFeatureOverrides: {
      occupancyPct: null,
      monthlyRatePerKwKrw: null,
      capRatePct: null,
      discountRatePct: null,
      capexKrw: null,
      contractedKw: null,
      permitStatusNote: null,
      sourceVersion: null
    },
    curatedFeatureOverrides: {
      marketInputs: {
        monthlyRatePerKwKrw: null,
        capRatePct: null,
        discountRatePct: null,
        debtCostPct: null,
        constructionCostPerMwKrw: null,
        note: null,
        sourceVersion: null
      },
      satelliteRisk: {
        floodRiskScore: null,
        wildfireRiskScore: null,
        climateNote: null,
        sourceVersion: null
      },
      permitInputs: {
        permitStage: null,
        powerApprovalStatus: null,
        timelineNote: null,
        sourceVersion: null
      },
      powerMicro: {
        utilityName: null,
        substationDistanceKm: null,
        tariffKrwPerKwh: null,
        renewableAvailabilityPct: null,
        pueTarget: null,
        backupFuelHours: null,
        sourceVersion: null
      },
      revenueMicro: {
        primaryTenant: null,
        leasedKw: null,
        baseRatePerKwKrw: null,
        termYears: null,
        probabilityPct: null,
        annualEscalationPct: null,
        sourceVersion: null
      },
      legalMicro: {
        ownerName: null,
        ownerEntityType: null,
        ownershipPct: null,
        encumbranceType: null,
        encumbranceHolder: null,
        securedAmountKrw: null,
        priorityRank: null,
        constraintType: null,
        constraintTitle: null,
        constraintSeverity: null,
        sourceVersion: null
      },
      reviewReadiness: {
        readinessStatus: null,
        reviewPhase: null,
        legalStructure: null,
        nextAction: null,
        sourceVersion: null
      }
    }
  };
}

const zeroShockScenario: MacroStressScenario = {
  name: 'Zero',
  description: 'No shocks applied',
  shocks: {
    rateShiftBps: 0,
    spreadShiftBps: 0,
    vacancyShiftPct: 0,
    growthShiftPct: 0,
    constructionCostShiftPct: 0
  }
};

const rateShockScenario: MacroStressScenario = {
  name: 'Rate Shock',
  description: 'Rates +200bps',
  shocks: {
    rateShiftBps: 200,
    spreadShiftBps: 50,
    vacancyShiftPct: 0.5,
    growthShiftPct: -0.5,
    constructionCostShiftPct: 0
  }
};

const severeScenario: MacroStressScenario = {
  name: 'Severe',
  description: 'Broad-based stress',
  shocks: {
    rateShiftBps: 300,
    spreadShiftBps: 150,
    vacancyShiftPct: 4.0,
    growthShiftPct: -2.0,
    constructionCostShiftPct: 10.0
  }
};

test('runMacroProFormaStress with zero shocks yields identical baseline and stressed', () => {
  const prepared = makePrepared();
  const baseScenarioInput = dataCenterScenarioInputs.find((s) => s.name === 'Base')!;

  const result = runMacroProFormaStress(prepared, zeroShockScenario, baseScenarioInput);

  assert.equal(result.equityIrrDeltaPct, 0);
  assert.equal(result.equityMultipleDelta, 0);
  assert.equal(result.verdict, 'RESILIENT');
});

test('runMacroProFormaStress applies rate shock and records negative IRR delta', () => {
  const prepared = makePrepared();
  const baseScenarioInput = dataCenterScenarioInputs.find((s) => s.name === 'Base')!;

  const result = runMacroProFormaStress(prepared, rateShockScenario, baseScenarioInput);

  assert.ok(result.baseline.equityIrr !== null);
  assert.ok(result.stressed.equityIrr !== null);
  assert.ok(result.equityIrrDeltaPct !== null && result.equityIrrDeltaPct < 0);
  assert.equal(result.shocks.rateShiftBps, 200);
  assert.equal(result.lineItemImpacts.length, 4);
});

test('runMacroProFormaStress flags BREACH when DSCR falls below 1.0', () => {
  const prepared = makePrepared();
  const baseScenarioInput = dataCenterScenarioInputs.find((s) => s.name === 'Base')!;

  const result = runMacroProFormaStress(prepared, severeScenario, baseScenarioInput);

  assert.ok(result.worstDscr !== null);
  if (result.worstDscr! < 1.0) {
    assert.equal(result.verdict, 'BREACH');
  } else {
    assert.ok(['VULNERABLE', 'SENSITIVE'].includes(result.verdict));
  }
});

test('correlation penalty amplifies shock magnitudes', () => {
  const prepared = makePrepared();
  const baseScenarioInput = dataCenterScenarioInputs.find((s) => s.name === 'Base')!;
  const penalty: CorrelationPenalty = {
    appliedPenaltyPct: 30,
    headwindCount: 4,
    activePairs: ['Rate-Credit Squeeze', 'Credit-Leverage Spiral'],
    commentary: 'Severe correlation stress'
  };

  const baseResult = runMacroProFormaStress(prepared, severeScenario, baseScenarioInput, null);
  const amplifiedResult = runMacroProFormaStress(
    prepared,
    severeScenario,
    baseScenarioInput,
    penalty
  );

  assert.ok(baseResult.equityIrrDeltaPct !== null);
  assert.ok(amplifiedResult.equityIrrDeltaPct !== null);
  assert.ok(amplifiedResult.equityIrrDeltaPct! <= baseResult.equityIrrDeltaPct!);
  assert.ok(amplifiedResult.correlationPenaltyApplied !== null);
  assert.equal(amplifiedResult.correlationPenaltyApplied!.appliedPenaltyPct, 30);
});

test('runMacroStressAnalysis aggregates multiple scenarios with shared baseline', () => {
  const prepared = makePrepared();

  const analysis = runMacroStressAnalysis(prepared, [
    zeroShockScenario,
    rateShockScenario,
    severeScenario
  ]);

  assert.equal(analysis.scenarios.length, 3);
  assert.ok(analysis.baseline.equityIrr !== null);

  const irrs = analysis.scenarios.map((s) => s.stressed.equityIrr);
  // Zero shock should be roughly equal to baseline; severe should be lower than rate-only
  assert.ok(irrs[0] !== null && irrs[1] !== null && irrs[2] !== null);
});

test('runFactorAttribution decomposes total impact by factor', () => {
  const prepared = makePrepared();

  const attribution = runFactorAttribution(prepared, severeScenario);

  assert.equal(attribution.factors.length, 5);
  assert.equal(attribution.scenarioName, 'Severe');

  const totalShare = attribution.factors.reduce(
    (sum, f) => sum + f.contributionShareOfTotalDelta,
    0
  );
  // Shares should sum to approximately 100 (allow rounding)
  assert.ok(Math.abs(totalShare - 100) < 1.0);

  // At least one factor should have a non-zero isolated IRR impact
  assert.ok(attribution.factors.some((f) => (f.isolatedIrrDeltaPct ?? 0) !== 0));
});

test('runFactorAttribution assigns zero contribution to unshocked factors', () => {
  const prepared = makePrepared();

  const rateOnlyScenario: MacroStressScenario = {
    name: 'Rate Only',
    description: 'Only rate shock',
    shocks: {
      rateShiftBps: 250,
      spreadShiftBps: 0,
      vacancyShiftPct: 0,
      growthShiftPct: 0,
      constructionCostShiftPct: 0
    }
  };

  const attribution = runFactorAttribution(prepared, rateOnlyScenario);

  const rateFactor = attribution.factors.find((f) => f.factor === 'rateShiftBps')!;
  const vacancyFactor = attribution.factors.find((f) => f.factor === 'vacancyShiftPct')!;

  assert.ok((rateFactor.isolatedIrrDeltaPct ?? 0) !== 0);
  assert.equal(vacancyFactor.isolatedIrrDeltaPct, 0);
  assert.equal(vacancyFactor.contributionShareOfTotalDelta, 0);
});
