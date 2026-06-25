import assert from 'node:assert/strict';
import test from 'node:test';
import type { MacroFactor } from '@prisma/client';

import { buildMacroForecastBacktest } from '@/lib/services/macro/forecast-backtest';

// ---------------------------------------------------------------------------
// (B) Honest baseline proof. The momentum forecast (current + (current -
// previous)) is now scored against a naive random-walk / persistence baseline
// (predict next == current) and a skill ratio (1 - momentumMAE / baselineMAE).
// directionalHitRatePct is no longer trusted in a vacuum.
// ---------------------------------------------------------------------------

function factor(market: string, factorKey: string, value: number, monthIndex: number): MacroFactor {
  const observationDate = new Date(Date.UTC(2026, monthIndex, 1));
  return {
    id: `${market}-${factorKey}-${monthIndex}`,
    assetId: null,
    market,
    factorKey,
    label: factorKey,
    observationDate,
    value,
    unit: '%',
    direction: 'NEUTRAL',
    commentary: '',
    sourceSystem: 'test',
    sourceStatus: 'FRESH' as MacroFactor['sourceStatus'],
    sourceUpdatedAt: observationDate,
    createdAt: observationDate,
    updatedAt: observationDate,
    trendDirection: null,
    trendMomentum: null,
    trendAcceleration: null,
    anomalyZScore: null,
    movingAvg3: null,
    movingAvg6: null,
    movingAvg12: null
  };
}

function series(market: string, factorKey: string, values: number[]): MacroFactor[] {
  return values.map((value, index) => factor(market, factorKey, value, index));
}

test('a perfectly linear factor → momentum beats naive with 100% skill', () => {
  // [100, 110, 120, 130]: a constant +10 drift. The momentum forecast nails the
  // next value every time (MAE 0); the persistence baseline lags by the drift.
  //   idx1: current=110 next=120 → baseline err = |110-120|/110*100 = 9.0909
  //   idx2: current=120 next=130 → baseline err = |120-130|/120*100 = 8.3333
  //   baseline MAE = round((9.0909 + 8.3333) / 2) = 8.7
  const result = buildMacroForecastBacktest(series('US', 'rate_level', [100, 110, 120, 130]));
  const row = result.markets[0]!.factors[0]!;

  assert.equal(row.sampleCount, 2);
  assert.equal(row.meanAbsoluteErrorPct, 0);
  assert.equal(row.baselineMeanAbsoluteErrorPct, 8.7);
  // skill = round((1 - 0 / 8.7) * 100) = 100
  assert.equal(row.skillVsNaivePct, 100);
});

test('a mean-reverting zigzag → momentum is WORSE than naive (negative skill)', () => {
  // [100, 110, 100, 110]: momentum over-extrapolates the reversal each step.
  //   idx1: prev=100 current=110 next=100
  //         momentum pred = 110 + 10 = 120 → err = |120-100|/110*100 = 18.1818
  //         baseline      = 110            → err = |110-100|/110*100 =  9.0909
  //   idx2: prev=110 current=100 next=110
  //         momentum pred = 100 - 10 =  90 → err = | 90-110|/100*100 = 20
  //         baseline      = 100            → err = |100-110|/100*100 = 10
  //   momentum MAE = round((18.1818 + 20) / 2) = 19.1
  //   baseline MAE = round(( 9.0909 + 10) / 2) =  9.5
  //   skill = round((1 - 19.1 / 9.5) * 100) = -101.1
  const result = buildMacroForecastBacktest(series('US', 'rate_level', [100, 110, 100, 110]));
  const row = result.markets[0]!.factors[0]!;

  assert.equal(row.meanAbsoluteErrorPct, 19.1);
  assert.equal(row.baselineMeanAbsoluteErrorPct, 9.5);
  assert.equal(row.skillVsNaivePct, -101.1);
  assert.ok(
    row.skillVsNaivePct! < 0,
    'momentum should score negative skill on a mean-reverting series'
  );
});

test('skill aggregates additively into market and summary rows', () => {
  const result = buildMacroForecastBacktest(series('US', 'rate_level', [100, 110, 120, 130]));

  // Single factor → market and summary skill equal the factor skill.
  assert.equal(result.markets[0]!.skillVsNaivePct, 100);
  assert.equal(result.markets[0]!.baselineMeanAbsoluteErrorPct, 8.7);
  assert.equal(result.summary.skillVsNaivePct, 100);
  assert.equal(result.summary.baselineMeanAbsoluteErrorPct, 8.7);

  // The legacy fields are untouched (purely additive change).
  assert.equal(result.markets[0]!.factors[0]!.meanAbsoluteErrorPct, 0);
  assert.equal(result.markets[0]!.factors[0]!.directionalHitRatePct, 100);
});

test('degenerate flat series → baseline error 0 → skill is null (undefined), not Infinity', () => {
  const result = buildMacroForecastBacktest(series('US', 'rate_level', [100, 100, 100, 100]));
  const row = result.markets[0]!.factors[0]!;
  assert.equal(row.baselineMeanAbsoluteErrorPct, 0);
  assert.equal(row.skillVsNaivePct, null);
  assert.equal(result.summary.skillVsNaivePct, null);
});
