import assert from 'node:assert/strict';
import test from 'node:test';
import type { MacroFactor, MacroSeries } from '@prisma/client';
import type { TrendAnalysis } from '@/lib/services/macro/trend';
import { generateTailRiskScenario } from '@/lib/services/macro/dynamic-scenarios';

function makeFactors(market: string): MacroFactor[] {
  const now = new Date();
  const entries = [
    { factorKey: 'rate_level', value: 5.5, direction: 'NEGATIVE' },
    { factorKey: 'credit_stress', value: 220, direction: 'NEUTRAL' },
    { factorKey: 'property_demand', value: -5, direction: 'NEUTRAL' },
    { factorKey: 'construction_pressure', value: 25, direction: 'NEUTRAL' }
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
    sourceStatus: 'FRESH' as MacroFactor['sourceStatus'],
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

const TRENDS: TrendAnalysis[] = [];

function makeSeries(perKeyValues: Record<string, number[]>): MacroSeries[] {
  const out: MacroSeries[] = [];
  let i = 0;
  for (const [seriesKey, values] of Object.entries(perKeyValues)) {
    values.forEach((value, t) => {
      const observationDate = new Date(Date.UTC(2023, t, 1));
      out.push({
        id: `s-${seriesKey}-${t}-${i++}`,
        assetId: null,
        market: 'SEOUL',
        seriesKey,
        label: seriesKey,
        frequency: 'monthly',
        observationDate,
        value,
        unit: '%',
        sourceSystem: 'test',
        sourceStatus: 'FRESH' as MacroSeries['sourceStatus'],
        sourceUpdatedAt: observationDate,
        createdAt: observationDate,
        updatedAt: observationDate
      });
    });
  }
  return out;
}

// 16 monthly observations (15 changes) for all five tail dimensions.
function fullHistory(): MacroSeries[] {
  const n = 16;
  const policy_rate_pct: number[] = [];
  const credit_spread_bps: number[] = [];
  const vacancy_pct: number[] = [];
  const rent_growth_pct: number[] = [];
  const construction_cost_index: number[] = [];
  let r = 3,
    c = 100,
    v = 5,
    g = 3,
    k = 100;
  for (let t = 0; t < n; t++) {
    r += 0.2 * (t % 2 === 0 ? 1 : -0.5);
    c += 5 * (t % 3 === 0 ? 1 : -0.4);
    v += 0.1 * (t % 2 === 0 ? 1 : -0.6);
    g += 0.15 * (t % 2 === 0 ? -1 : 0.5);
    k += 1.2 * (t % 2 === 0 ? 1 : -0.3);
    policy_rate_pct.push(r);
    credit_spread_bps.push(c);
    vacancy_pct.push(v);
    rent_growth_pct.push(g);
    construction_cost_index.push(k);
  }
  return makeSeries({
    policy_rate_pct,
    credit_spread_bps,
    vacancy_pct,
    rent_growth_pct,
    construction_cost_index
  });
}

// ---------------------------------------------------------------------------
// FALLBACK: no series → original fixed-constant scenario
// ---------------------------------------------------------------------------
test('no history → fixed adverse shocks (legacy constants)', () => {
  const scenario = generateTailRiskScenario({
    market: 'SEOUL',
    factors: makeFactors('SEOUL'),
    trends: TRENDS
  });
  // rate_level NEGATIVE → fixed 250bps; others neutral → baseline constants.
  assert.equal(scenario.shocks.rateShiftBps, 250);
  assert.equal(scenario.shocks.spreadShiftBps, 75);
  assert.match(scenario.description, /Fixed adverse shocks/);
});

test('insufficient history → fixed adverse shocks (fallback)', () => {
  const series = makeSeries({
    policy_rate_pct: [3, 3.2, 3.4, 3.5, 3.6],
    credit_spread_bps: [100, 110, 120, 125, 130],
    vacancy_pct: [5, 5.1, 5.2, 5.3, 5.4],
    rent_growth_pct: [3, 2.9, 2.8, 2.7, 2.6],
    construction_cost_index: [100, 101, 102, 103, 104]
  });
  const scenario = generateTailRiskScenario({
    market: 'SEOUL',
    factors: makeFactors('SEOUL'),
    trends: TRENDS,
    series
  });
  assert.match(scenario.description, /Fixed adverse shocks/);
  assert.equal(scenario.shocks.rateShiftBps, 250);
});

// ---------------------------------------------------------------------------
// DATA-DRIVEN: sufficient history → genuine σ-based correlated draw
// ---------------------------------------------------------------------------
test('sufficient history → covariance-aware σ-based shocks', () => {
  const scenario = generateTailRiskScenario({
    market: 'SEOUL',
    factors: makeFactors('SEOUL'),
    trends: TRENDS,
    series: fullHistory()
  });

  assert.match(scenario.description, /Covariance-aware/);
  assert.match(scenario.description, /σ/);
  // Adverse orientation: rises are non-negative, growth is non-positive.
  assert.ok(scenario.shocks.rateShiftBps >= 0);
  assert.ok(scenario.shocks.spreadShiftBps >= 0);
  assert.ok(scenario.shocks.vacancyShiftPct >= 0);
  assert.ok(scenario.shocks.growthShiftPct <= 0);
  assert.ok(scenario.shocks.constructionCostShiftPct >= 0);
  // Shock magnitudes are finite and scaled from the data, not the fixed 250.
  assert.ok(Number.isFinite(scenario.shocks.rateShiftBps));
});

test('data-driven scenario is deterministic across runs', () => {
  const ctx = {
    market: 'SEOUL',
    factors: makeFactors('SEOUL'),
    trends: TRENDS,
    series: fullHistory()
  };
  const a = generateTailRiskScenario(ctx);
  const b = generateTailRiskScenario(ctx);
  assert.deepEqual(a.shocks, b.shocks);
});
