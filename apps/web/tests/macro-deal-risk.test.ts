import assert from 'node:assert/strict';
import test from 'node:test';
import type { MacroFactor } from '@prisma/client';
import {
  computeDealMacroExposure,
  runMacroStressTest,
  buildDealMacroRiskSummary,
  runAllStressTests,
  STRESS_SCENARIOS
} from '@/lib/services/macro/deal-risk';

function makeFactors(market: string, overrides?: Partial<Record<string, { value: number; direction: string; trendMomentum: number | null }>>): MacroFactor[] {
  const now = new Date();
  const defaults: Record<string, { value: number; direction: string; trendMomentum: number | null }> = {
    rate_level: { value: 5.5, direction: 'NEUTRAL', trendMomentum: null },
    rate_momentum_bps: { value: 30, direction: 'NEGATIVE', trendMomentum: 0.1 },
    credit_stress: { value: 200, direction: 'NEUTRAL', trendMomentum: null },
    liquidity: { value: 95, direction: 'NEUTRAL', trendMomentum: null },
    growth_momentum: { value: 2.0, direction: 'POSITIVE', trendMomentum: null },
    construction_pressure: { value: 20, direction: 'NEUTRAL', trendMomentum: null },
    property_demand: { value: 5, direction: 'NEUTRAL', trendMomentum: null },
    ...overrides
  };

  return Object.entries(defaults).map(([factorKey, spec], i) => ({
    id: `f-${i}`,
    assetId: null,
    market,
    factorKey,
    label: factorKey,
    observationDate: now,
    value: spec.value,
    unit: 'mixed',
    direction: spec.direction,
    commentary: '',
    sourceSystem: 'test',
    sourceStatus: 'FRESH' as any,
    sourceUpdatedAt: now,
    trendDirection: null,
    trendMomentum: spec.trendMomentum,
    trendAcceleration: null,
    anomalyZScore: null,
    movingAvg3: null,
    movingAvg6: null,
    movingAvg12: null,
    createdAt: now,
    updatedAt: now
  }));
}

const baseDeal = {
  id: 'deal-1',
  market: 'KR',
  assetClass: 'DATA_CENTER',
  financingLtvPct: 60,
  financingRatePct: 5.5,
  stage: 'IC_REVIEW'
};

test('computeDealMacroExposure returns a valid exposure with 6 dimensions', () => {
  const factors = makeFactors('KR');
  const exposure = computeDealMacroExposure(baseDeal, factors);

  assert.equal(exposure.dealId, 'deal-1');
  assert.equal(exposure.market, 'KR');
  assert.equal(exposure.dimensions.length, 6);
  assert.ok(exposure.overallScore >= 0 && exposure.overallScore <= 100);
  assert.ok(['LOW', 'MODERATE', 'HIGH', 'CRITICAL'].includes(exposure.band));
  assert.ok(exposure.summary.length > 0);

  const dimKeys = exposure.dimensions.map((d) => d.key);
  assert.ok(dimKeys.includes('rate'));
  assert.ok(dimKeys.includes('credit'));
  assert.ok(dimKeys.includes('demand'));
  assert.ok(dimKeys.includes('construction'));
  assert.ok(dimKeys.includes('leverage'));
  assert.ok(dimKeys.includes('liquidity'));
});

test('computeDealMacroExposure scores higher when all factors are NEGATIVE', () => {
  const negativeFactors = makeFactors('KR', {
    rate_level: { value: 7.0, direction: 'NEGATIVE', trendMomentum: null },
    rate_momentum_bps: { value: 50, direction: 'NEGATIVE', trendMomentum: 0.2 },
    credit_stress: { value: 300, direction: 'NEGATIVE', trendMomentum: 0.1 },
    liquidity: { value: 60, direction: 'NEGATIVE', trendMomentum: null },
    construction_pressure: { value: 40, direction: 'NEGATIVE', trendMomentum: 0.15 },
    property_demand: { value: -15, direction: 'NEGATIVE', trendMomentum: null }
  });

  const neutralFactors = makeFactors('KR');

  const negativeExposure = computeDealMacroExposure(baseDeal, negativeFactors);
  const neutralExposure = computeDealMacroExposure(baseDeal, neutralFactors);

  assert.ok(negativeExposure.overallScore > neutralExposure.overallScore);
});

test('computeDealMacroExposure gives higher construction weight for development deals', () => {
  const factors = makeFactors('KR', {
    construction_pressure: { value: 40, direction: 'NEGATIVE', trendMomentum: 0.15 }
  });

  const devDeal = { ...baseDeal, stage: 'DD' };
  const stabilizedDeal = { ...baseDeal, stage: 'IC_REVIEW' };

  const devExposure = computeDealMacroExposure(devDeal, factors);
  const stabExposure = computeDealMacroExposure(stabilizedDeal, factors);

  const devConstruction = devExposure.dimensions.find((d) => d.key === 'construction')!;
  const stabConstruction = stabExposure.dimensions.find((d) => d.key === 'construction')!;

  assert.ok(devConstruction.score > stabConstruction.score);
});

test('computeDealMacroExposure leverage dimension rises with LTV', () => {
  const factors = makeFactors('KR');

  const lowLtv = computeDealMacroExposure({ ...baseDeal, financingLtvPct: 45 }, factors);
  const highLtv = computeDealMacroExposure({ ...baseDeal, financingLtvPct: 75 }, factors);

  const lowLev = lowLtv.dimensions.find((d) => d.key === 'leverage')!;
  const highLev = highLtv.dimensions.find((d) => d.key === 'leverage')!;

  assert.ok(highLev.score > lowLev.score);
});

test('computeDealMacroExposure returns band labels correctly', () => {
  const factors = makeFactors('KR');
  const exposure = computeDealMacroExposure(baseDeal, factors);

  if (exposure.overallScore >= 75) assert.equal(exposure.band, 'CRITICAL');
  else if (exposure.overallScore >= 55) assert.equal(exposure.band, 'HIGH');
  else if (exposure.overallScore >= 35) assert.equal(exposure.band, 'MODERATE');
  else assert.equal(exposure.band, 'LOW');
});

test('runMacroStressTest produces a valid result', () => {
  const factors = makeFactors('KR');
  const result = runMacroStressTest(baseDeal, factors, STRESS_SCENARIOS[0]!);

  assert.equal(result.dealId, 'deal-1');
  assert.equal(result.scenario.name, 'Rate Shock');
  assert.ok(result.baselineCapRate !== null);
  assert.ok(result.stressedCapRate !== null);
  assert.ok(result.stressedCapRate! > result.baselineCapRate!);
  assert.ok(result.valuationImpactPct !== null);
  assert.ok(['RESILIENT', 'SENSITIVE', 'VULNERABLE'].includes(result.verdict));
  assert.ok(result.commentary.length > 0);
});

test('runMacroStressTest high LTV amplifies impact', () => {
  const factors = makeFactors('KR');

  const lowLtvResult = runMacroStressTest(
    { ...baseDeal, financingLtvPct: 50 },
    factors,
    STRESS_SCENARIOS[0]!
  );
  const highLtvResult = runMacroStressTest(
    { ...baseDeal, financingLtvPct: 75 },
    factors,
    STRESS_SCENARIOS[0]!
  );

  assert.ok(
    Math.abs(highLtvResult.valuationImpactPct!) >= Math.abs(lowLtvResult.valuationImpactPct!)
  );
});

test('runAllStressTests returns results for all predefined scenarios', () => {
  const factors = makeFactors('KR');
  const results = runAllStressTests(baseDeal, factors);

  assert.equal(results.length, STRESS_SCENARIOS.length);
  assert.equal(results.length, 3);

  const scenarioNames = results.map((r) => r.scenario.name);
  assert.ok(scenarioNames.includes('Rate Shock'));
  assert.ok(scenarioNames.includes('Credit Crunch'));
  assert.ok(scenarioNames.includes('Stagflation'));
});

test('buildDealMacroRiskSummary processes multiple deals', () => {
  const factors = makeFactors('KR');
  const deals = [
    baseDeal,
    { ...baseDeal, id: 'deal-2', financingLtvPct: 70 },
    { ...baseDeal, id: 'deal-3', stage: 'DD' }
  ];

  const summaries = buildDealMacroRiskSummary(deals, factors);

  assert.equal(summaries.length, 3);
  assert.equal(summaries[0]!.dealId, 'deal-1');
  assert.equal(summaries[1]!.dealId, 'deal-2');
  assert.equal(summaries[2]!.dealId, 'deal-3');
});

test('computeDealMacroExposure handles empty factors gracefully', () => {
  const exposure = computeDealMacroExposure(baseDeal, []);

  assert.equal(exposure.dimensions.length, 6);
  assert.ok(exposure.overallScore >= 0);
  assert.ok(exposure.summary.length > 0);
});
