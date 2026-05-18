import assert from 'node:assert/strict';
import test from 'node:test';
import type { MacroFactor } from '@prisma/client';
import type { TrendAnalysis } from '@/lib/services/macro/trend';
import {
  generateTrendContinuationScenario,
  generateTailRiskScenario,
  generateDynamicScenarios
} from '@/lib/services/macro/dynamic-scenarios';

function makeFactors(market: string): MacroFactor[] {
  const now = new Date();
  const entries = [
    { factorKey: 'rate_level', value: 5.5, direction: 'NEGATIVE' },
    { factorKey: 'credit_stress', value: 220, direction: 'NEGATIVE' },
    { factorKey: 'property_demand', value: -5, direction: 'NEGATIVE' },
    { factorKey: 'construction_pressure', value: 25, direction: 'NEUTRAL' },
    { factorKey: 'liquidity', value: 90, direction: 'NEUTRAL' }
  ];
  return entries.map((e, i) => ({
    id: `f-${i}`,
    assetId: null,
    market,
    factorKey: e.factorKey,
    label: e.factorKey,
    observationDate: now,
    value: e.value,
    unit: 'mixed',
    direction: e.direction,
    commentary: '',
    sourceSystem: 'test',
    sourceStatus: 'FRESH' as any,
    sourceUpdatedAt: now,
    trendDirection: null,
    trendMomentum: null,
    trendAcceleration: null,
    anomalyZScore: null,
    movingAvg3: null,
    movingAvg6: null,
    movingAvg12: null,
    createdAt: now,
    updatedAt: now
  }));
}

function makeTrends(): TrendAnalysis[] {
  return [
    {
      seriesKey: 'policy_rate_pct',
      label: 'Policy Rate',
      direction: 'RISING',
      momentum: 0.15,
      acceleration: 0.02,
      movingAverages: { 3: 5.0, 6: 4.8, 12: 4.5 },
      anomaly: null,
      observationCount: 12
    },
    {
      seriesKey: 'credit_spread_bps',
      label: 'Credit Spread',
      direction: 'RISING',
      momentum: 8.0,
      acceleration: 1.0,
      movingAverages: { 3: 200, 6: 190, 12: 180 },
      anomaly: null,
      observationCount: 12
    },
    {
      seriesKey: 'vacancy_pct',
      label: 'Vacancy',
      direction: 'RISING',
      momentum: 0.2,
      acceleration: 0.05,
      movingAverages: { 3: 5.0, 6: 4.5, 12: 4.0 },
      anomaly: null,
      observationCount: 12
    },
    {
      seriesKey: 'rent_growth_pct',
      label: 'Rent Growth',
      direction: 'DECLINING',
      momentum: -0.1,
      acceleration: -0.02,
      movingAverages: { 3: 2.0, 6: 2.2, 12: 2.5 },
      anomaly: null,
      observationCount: 12
    },
    {
      seriesKey: 'construction_cost_index',
      label: 'Construction Cost',
      direction: 'RISING',
      momentum: 1.5,
      acceleration: 0.3,
      movingAverages: { 3: 110, 6: 108, 12: 105 },
      anomaly: null,
      observationCount: 12
    }
  ];
}

test('generateTrendContinuationScenario produces valid shocks from rising trends', () => {
  const scenario = generateTrendContinuationScenario({
    market: 'KR',
    factors: makeFactors('KR'),
    trends: makeTrends()
  });

  assert.equal(scenario.name, 'Trend Continuation');
  assert.ok(scenario.shocks.rateShiftBps >= 0);
  assert.ok(scenario.shocks.spreadShiftBps >= 0);
  assert.ok(scenario.shocks.vacancyShiftPct >= 0);
  assert.ok(scenario.shocks.growthShiftPct <= 0);
  assert.ok(scenario.description.length > 0);
});

test('generateTrendContinuationScenario produces minimal shocks for flat trends', () => {
  const flatTrends: TrendAnalysis[] = [
    {
      seriesKey: 'policy_rate_pct',
      label: 'Policy Rate',
      direction: 'FLAT',
      momentum: 0.01,
      acceleration: 0,
      movingAverages: { 3: 3.5, 6: 3.5, 12: 3.5 },
      anomaly: null,
      observationCount: 12
    },
    {
      seriesKey: 'credit_spread_bps',
      label: 'Credit Spread',
      direction: 'FLAT',
      momentum: 0.5,
      acceleration: 0,
      movingAverages: { 3: 150, 6: 150, 12: 150 },
      anomaly: null,
      observationCount: 12
    }
  ];

  const scenario = generateTrendContinuationScenario({
    market: 'KR',
    factors: makeFactors('KR'),
    trends: flatTrends
  });

  assert.ok(scenario.shocks.rateShiftBps <= 50);
  assert.ok(scenario.shocks.spreadShiftBps <= 30);
});

test('generateTailRiskScenario amplifies shocks on NEGATIVE factors', () => {
  const scenario = generateTailRiskScenario({
    market: 'KR',
    factors: makeFactors('KR'),
    trends: makeTrends()
  });

  assert.equal(scenario.name, 'Dynamic Tail Risk');
  // rate_level is NEGATIVE, so rate shock should be 250bps
  assert.equal(scenario.shocks.rateShiftBps, 250);
  // credit_stress is NEGATIVE, so spread shock should be 200bps
  assert.equal(scenario.shocks.spreadShiftBps, 200);
  assert.ok(scenario.description.includes('rates'));
  assert.ok(scenario.description.includes('credit'));
});

test('generateDynamicScenarios returns both scenarios', () => {
  const scenarios = generateDynamicScenarios({
    market: 'KR',
    factors: makeFactors('KR'),
    trends: makeTrends()
  });

  assert.equal(scenarios.length, 2);
  assert.equal(scenarios[0]!.name, 'Trend Continuation');
  assert.equal(scenarios[1]!.name, 'Dynamic Tail Risk');
});
