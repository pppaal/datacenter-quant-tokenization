import assert from 'node:assert/strict';
import test from 'node:test';
import { AssetClass } from '@prisma/client';
import {
  buildPointInTimeTrainingSamples,
  type ForecastRunLike
} from '@/lib/services/forecast/gradient-boosting';
import {
  buildGradientBoostingRealizedBacktest,
  computeOutOfSampleMetrics,
  HORIZON_MAX_DAYS,
  HORIZON_MIN_DAYS
} from '@/lib/services/forecast/realized-backtest';

function forecastRun(input: {
  id: string;
  assetId: string;
  createdAt: string;
  baseCaseValueKrw: number;
  occupancyPct?: number;
}): ForecastRunLike {
  return {
    id: input.id,
    assetId: input.assetId,
    createdAt: new Date(input.createdAt),
    baseCaseValueKrw: input.baseCaseValueKrw,
    confidenceScore: 70,
    assumptions: { occupancyPct: input.occupancyPct ?? 90, capRatePct: 6, debtCostPct: 5 },
    asset: { id: input.assetId, market: 'US', assetClass: AssetClass.OFFICE },
    scenarios: [{ name: 'Base', debtServiceCoverage: 1.4 }]
  };
}

// ---------------------------------------------------------------------------
// 1. Leakage: training set for predicting run R must exclude R and any pair
//    sourced at/after R (strict point-in-time split).
// ---------------------------------------------------------------------------
test('point-in-time training excludes the predicted run and any at/after pair', () => {
  const assetId = 'asset-a';
  const runs: ForecastRunLike[] = [
    forecastRun({ id: 'r0', assetId, createdAt: '2025-01-01T00:00:00Z', baseCaseValueKrw: 100 }),
    forecastRun({ id: 'r1', assetId, createdAt: '2025-04-01T00:00:00Z', baseCaseValueKrw: 110 }),
    forecastRun({ id: 'r2', assetId, createdAt: '2025-07-01T00:00:00Z', baseCaseValueKrw: 120 }),
    // R: the run we are predicting.
    forecastRun({ id: 'R', assetId, createdAt: '2025-10-01T00:00:00Z', baseCaseValueKrw: 130 }),
    // A run AFTER R — its forward pair must never enter training.
    forecastRun({ id: 'rAfter', assetId, createdAt: '2026-01-01T00:00:00Z', baseCaseValueKrw: 140 })
  ];

  const cutoff = new Date('2025-10-01T00:00:00Z');
  const samples = buildPointInTimeTrainingSamples(runs, cutoff, 'R');

  // Only (r0->r1) and (r1->r2) are fully prior to R. The (r2->R) pair touches R
  // and (R->rAfter) / pairs at/after the cutoff are excluded.
  assert.equal(samples.length, 2);

  // (r0->r1): (110-100)/100*100 = 10 ; (r1->r2): (120-110)/110*100 ≈ 9.0909
  const targets = samples
    .map((s) => Number(s.targetValueChangePct.toFixed(4)))
    .sort((a, b) => a - b);
  assert.deepEqual(targets, [9.0909, 10]);
});

test('point-in-time training drops everything when no fully-prior pair exists', () => {
  const assetId = 'asset-a';
  const runs: ForecastRunLike[] = [
    forecastRun({ id: 'r0', assetId, createdAt: '2025-08-01T00:00:00Z', baseCaseValueKrw: 100 }),
    forecastRun({ id: 'R', assetId, createdAt: '2025-10-01T00:00:00Z', baseCaseValueKrw: 110 })
  ];
  // (r0->R) touches R and R is excluded => no admissible training pair.
  const samples = buildPointInTimeTrainingSamples(runs, new Date('2025-10-01T00:00:00Z'), 'R');
  assert.equal(samples.length, 0);
});

// ---------------------------------------------------------------------------
// 2. Metrics math on a known dataset (pinned numbers).
// ---------------------------------------------------------------------------
test('RMSE / MAE / MAPE / skill computed correctly on a known dataset', () => {
  // model errors, baseline errors, actuals.
  const modelErrors = [1, -1, 2, -2]; // |e|: 1,1,2,2 ; e^2: 1,1,4,4
  const baselineErrors = [2, -2, 4, -4]; // |e|: 2,2,4,4 ; e^2: 4,4,16,16
  const actuals = [10, 10, 10, 10];

  const m = computeOutOfSampleMetrics(modelErrors, baselineErrors, actuals);

  assert.equal(m.status, 'OK');
  assert.equal(m.evaluatedCount, 4);
  // MAE = (1+1+2+2)/4 = 1.5
  assert.equal(m.maePct, 1.5);
  // RMSE = sqrt((1+1+4+4)/4) = sqrt(2.5) = 1.5811...
  assert.equal(m.rmsePct, 1.58);
  // baseline MAE = (2+2+4+4)/4 = 3 ; baseline RMSE = sqrt((4+4+16+16)/4)=sqrt(10)=3.1623
  assert.equal(m.baselineMaePct, 3);
  assert.equal(m.baselineRmsePct, 3.16);
  // MAPE = mean(|e|/|actual|)*100 = mean(0.1,0.1,0.2,0.2)*100 = 15
  assert.equal(m.mapePct, 15);
  // skill = 1 - modelRMSE/baselineRMSE = 1 - sqrt(2.5)/sqrt(10) = 1 - 0.5 = 0.5
  assert.equal(m.skillVsNaive, 0.5);
});

test('skill > 0 for a clearly-good model and ~0 for a no-skill model', () => {
  const actuals = [5, 5, 5, 5];

  // Good model: tiny errors vs a large-error baseline.
  const good = computeOutOfSampleMetrics([0.2, -0.2, 0.1, -0.1], [3, -3, 3, -3], actuals);
  assert.ok(good.skillVsNaive !== null && good.skillVsNaive > 0);

  // No-skill model: identical errors to the naive baseline => skill ~0.
  const noSkill = computeOutOfSampleMetrics([2, -2, 2, -2], [2, -2, 2, -2], actuals);
  assert.equal(noSkill.skillVsNaive, 0);

  // Worse-than-naive model => negative skill.
  const bad = computeOutOfSampleMetrics([5, -5, 5, -5], [1, -1, 1, -1], actuals);
  assert.ok(bad.skillVsNaive !== null && bad.skillVsNaive < 0);
});

test('insufficient out-of-sample points returns a labeled status, not a number', () => {
  const m = computeOutOfSampleMetrics([1, -1], [2, -2], [10, 10]);
  assert.equal(m.status, 'INSUFFICIENT_HISTORY');
  assert.equal(m.rmsePct, null);
  assert.equal(m.maePct, null);
  assert.equal(m.skillVsNaive, null);
});

// ---------------------------------------------------------------------------
// 3. Horizon filtering: out-of-band realized outcomes are excluded.
// ---------------------------------------------------------------------------
function runWithAsset(id: string, assetId: string, createdAt: string, value: number) {
  return {
    id,
    assetId,
    createdAt: new Date(createdAt),
    baseCaseValueKrw: value,
    confidenceScore: 70,
    assumptions: { occupancyPct: 90, capRatePct: 6, debtCostPct: 5 },
    asset: {
      id: assetId,
      name: assetId,
      assetCode: assetId,
      assetClass: AssetClass.OFFICE,
      market: 'US'
    },
    scenarios: [{ name: 'Base', debtServiceCoverage: 1.4 }]
  };
}

function plusDays(iso: string, days: number) {
  const date = new Date(iso);
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

test('horizon band rejects too-soon and too-late outcomes', () => {
  const tooSoon = HORIZON_MIN_DAYS - 30;
  const inBand = 365;
  const tooLate = HORIZON_MAX_DAYS + 30;

  const runs = [
    runWithAsset('run-soon', 'asset-soon', '2024-01-01T00:00:00Z', 100),
    runWithAsset('run-band', 'asset-band', '2024-01-01T00:00:00Z', 100),
    runWithAsset('run-late', 'asset-late', '2024-01-01T00:00:00Z', 100)
  ];
  const outcomes = [
    {
      id: 'o-soon',
      assetId: 'asset-soon',
      observationDate: plusDays('2024-01-01T00:00:00Z', tooSoon),
      valuationKrw: 110,
      debtServiceCoverage: 1.5
    },
    {
      id: 'o-band',
      assetId: 'asset-band',
      observationDate: plusDays('2024-01-01T00:00:00Z', inBand),
      valuationKrw: 110,
      debtServiceCoverage: 1.5
    },
    {
      id: 'o-late',
      assetId: 'asset-late',
      observationDate: plusDays('2024-01-01T00:00:00Z', tooLate),
      valuationKrw: 110,
      debtServiceCoverage: 1.5
    }
  ];

  const backtest = buildGradientBoostingRealizedBacktest({ runs, outcomes });
  // Only the in-band asset is labeled; but with a single labeled point there is
  // no out-of-sample evaluation (needs >=3 prior). So matchedForecastCount is 0
  // because no run has >=3 strictly-prior labeled training points.
  assert.equal(backtest.summary.outOfSample.status, 'INSUFFICIENT_HISTORY');
  // None of the rows should reference the out-of-band outcomes.
  for (const row of backtest.rows) {
    assert.notEqual(row.outcomeDate, outcomes[0]!.observationDate.toISOString());
    assert.notEqual(row.outcomeDate, outcomes[2]!.observationDate.toISOString());
  }
});

// ---------------------------------------------------------------------------
// 4. End-to-end walk-forward produces leakage-free OOS metrics with enough data.
// ---------------------------------------------------------------------------
test('walk-forward backtest reports out-of-sample metrics once history is deep enough', () => {
  // 6 runs across distinct assets, created ~16 months apart so that each prior
  // run's realized outcome (365 days later) is observable BEFORE the next run is
  // created. This is what gives the walk-forward expanding window real depth:
  // once >=3 fully-prior labeled points exist, later points are evaluated OOS.
  const runs = [];
  const outcomes = [];
  // Alternate the realized horizon change so the naive (mean-drift) baseline has
  // nonzero error, leaving room for a skill comparison.
  const realizedChangePct = [4, 12, 5, 11, 6, 10];
  for (let i = 0; i < 6; i += 1) {
    const created = new Date(Date.UTC(2018 + Math.floor((i * 16) / 12), (i * 16) % 12, 1));
    const createdIso = created.toISOString();
    const value = 100 + i * 10;
    const run = runWithAsset(`run-${i}`, `asset-${i}`, createdIso, value);
    // Give the model a learnable feature: occupancy tracks the realized change.
    run.assumptions = { occupancyPct: 80 + realizedChangePct[i]!, capRatePct: 6, debtCostPct: 5 };
    runs.push(run);
    outcomes.push({
      id: `o-${i}`,
      assetId: `asset-${i}`,
      observationDate: plusDays(createdIso, 365),
      valuationKrw: value * (1 + realizedChangePct[i]! / 100),
      debtServiceCoverage: 1.5
    });
  }

  const backtest = buildGradientBoostingRealizedBacktest({ runs, outcomes });

  assert.equal(backtest.summary.outOfSample.status, 'OK');
  assert.ok(backtest.summary.outOfSample.evaluatedCount >= 3);
  assert.ok(backtest.summary.outOfSample.rmsePct !== null);
  assert.ok(backtest.summary.outOfSample.maePct !== null);
  assert.ok(backtest.summary.outOfSample.skillVsNaive !== null);
  // Every evaluated row must reference a horizon-aligned (365-day) outcome only.
  for (const row of backtest.rows) {
    assert.ok(row.horizonDays >= HORIZON_MIN_DAYS && row.horizonDays <= HORIZON_MAX_DAYS);
  }
});
