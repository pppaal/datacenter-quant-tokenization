import assert from 'node:assert/strict';
import test from 'node:test';
import { AssetClass } from '@prisma/client';
import {
  buildAnalysisBacktest,
  selectRealizedAfterPrediction,
  type AnalysisPrediction,
  type RealizedPriceObservation
} from '@/lib/services/property-analyzer/analysis-backtest';

function prediction(overrides: Partial<AnalysisPrediction> = {}): AnalysisPrediction {
  return {
    snapshotId: 'snap-1',
    pnu: 'PNU-A',
    assetClass: AssetClass.OFFICE,
    predictedAt: new Date('2024-01-01T00:00:00.000Z'),
    predictedValueKrw: 100_000,
    predictedExitCapRatePct: 6.0,
    ...overrides
  };
}

function observation(overrides: Partial<RealizedPriceObservation> = {}): RealizedPriceObservation {
  return {
    pnu: 'PNU-A',
    observedAt: new Date('2024-06-01T00:00:00.000Z'),
    realizedValueKrw: 90_000,
    realizedExitCapRatePct: 6.5,
    ...overrides
  };
}

test('point-in-time separation: a realized price dated BEFORE the prediction is excluded', () => {
  const pred = prediction({ predictedAt: new Date('2024-03-01T00:00:00.000Z') });
  const before = observation({ observedAt: new Date('2024-02-01T00:00:00.000Z') });
  const after = observation({
    observedAt: new Date('2024-05-01T00:00:00.000Z'),
    realizedValueKrw: 80_000
  });

  // Only the AFTER observation may be matched.
  assert.equal(selectRealizedAfterPrediction(pred, [before]), null);
  const matched = selectRealizedAfterPrediction(pred, [before, after]);
  assert.ok(matched);
  assert.equal(matched.realizedValueKrw, 80_000);
});

test('point-in-time: an observation dated exactly AT the prediction is excluded (strict >)', () => {
  const at = new Date('2024-03-01T00:00:00.000Z');
  const pred = prediction({ predictedAt: at });
  const sameInstant = observation({ observedAt: new Date('2024-03-01T00:00:00.000Z') });
  assert.equal(selectRealizedAfterPrediction(pred, [sameInstant]), null);
});

test('selects the EARLIEST realized observation after the prediction', () => {
  const pred = prediction({ predictedAt: new Date('2024-01-01T00:00:00.000Z') });
  const obs = [
    observation({ observedAt: new Date('2024-09-01T00:00:00.000Z'), realizedValueKrw: 70_000 }),
    observation({ observedAt: new Date('2024-04-01T00:00:00.000Z'), realizedValueKrw: 95_000 })
  ];
  const matched = selectRealizedAfterPrediction(pred, obs);
  assert.ok(matched);
  assert.equal(matched.realizedValueKrw, 95_000);
});

test('MAPE and mean bias are computed correctly on a known fixture', () => {
  // Predicted 100k vs realized 80k => +25% error (over-valued).
  // Predicted 100k vs realized 125k => -20% error (under-valued).
  const predictions = [
    prediction({ snapshotId: 's1', pnu: 'P1', predictedValueKrw: 100_000 }),
    prediction({ snapshotId: 's2', pnu: 'P2', predictedValueKrw: 100_000 })
  ];
  const observations = [
    observation({ pnu: 'P1', realizedValueKrw: 80_000, realizedExitCapRatePct: null }),
    observation({ pnu: 'P2', realizedValueKrw: 125_000, realizedExitCapRatePct: null })
  ];

  const result = buildAnalysisBacktest({ predictions, observations });
  assert.equal(result.overall.count, 2);
  // |+25| and |-20| => MAPE = 22.5
  assert.equal(result.overall.mapePct, 22.5);
  // (+25 + -20) / 2 = +2.5 mean signed bias
  assert.equal(result.overall.meanBiasPct, 2.5);
});

test('cap-rate residual = predicted - realized, averaged, skipping null pairs', () => {
  const predictions = [
    prediction({ snapshotId: 's1', pnu: 'P1', predictedExitCapRatePct: 6.0 }),
    prediction({ snapshotId: 's2', pnu: 'P2', predictedExitCapRatePct: 5.0 }),
    prediction({ snapshotId: 's3', pnu: 'P3', predictedExitCapRatePct: null })
  ];
  const observations = [
    observation({ pnu: 'P1', realizedValueKrw: 100_000, realizedExitCapRatePct: 5.5 }),
    observation({ pnu: 'P2', realizedValueKrw: 100_000, realizedExitCapRatePct: 5.5 }),
    observation({ pnu: 'P3', realizedValueKrw: 100_000, realizedExitCapRatePct: 5.5 })
  ];
  const result = buildAnalysisBacktest({ predictions, observations });
  // residuals: (6.0-5.5)=+0.5, (5.0-5.5)=-0.5, third skipped (null predicted)
  assert.equal(result.overall.meanCapRateResidualPct, 0);
});

test('per asset-class and per-vintage grouping is correct', () => {
  const predictions = [
    prediction({
      snapshotId: 'o24',
      pnu: 'P1',
      assetClass: AssetClass.OFFICE,
      predictedAt: new Date('2024-02-01T00:00:00.000Z'),
      predictedValueKrw: 100_000
    }),
    prediction({
      snapshotId: 'o23',
      pnu: 'P2',
      assetClass: AssetClass.OFFICE,
      predictedAt: new Date('2023-02-01T00:00:00.000Z'),
      predictedValueKrw: 100_000
    }),
    prediction({
      snapshotId: 'dc24',
      pnu: 'P3',
      assetClass: AssetClass.DATA_CENTER,
      predictedAt: new Date('2024-02-01T00:00:00.000Z'),
      predictedValueKrw: 100_000
    })
  ];
  const observations = [
    observation({
      pnu: 'P1',
      observedAt: new Date('2024-08-01T00:00:00.000Z'),
      realizedValueKrw: 100_000,
      realizedExitCapRatePct: null
    }),
    observation({
      pnu: 'P2',
      observedAt: new Date('2023-08-01T00:00:00.000Z'),
      realizedValueKrw: 100_000,
      realizedExitCapRatePct: null
    }),
    observation({
      pnu: 'P3',
      observedAt: new Date('2024-08-01T00:00:00.000Z'),
      realizedValueKrw: 100_000,
      realizedExitCapRatePct: null
    })
  ];

  const result = buildAnalysisBacktest({ predictions, observations });

  const office = result.byAssetClass.find((g) => g.key === AssetClass.OFFICE);
  const dc = result.byAssetClass.find((g) => g.key === AssetClass.DATA_CENTER);
  assert.ok(office);
  assert.ok(dc);
  assert.equal(office.count, 2);
  assert.equal(dc.count, 1);

  const v2024 = result.byVintage.find((g) => g.key === '2024');
  const v2023 = result.byVintage.find((g) => g.key === '2023');
  assert.ok(v2024);
  assert.ok(v2023);
  assert.equal(v2024.count, 2); // OFFICE 2024 + DATA_CENTER 2024
  assert.equal(v2023.count, 1);

  const officeV2024 = result.byAssetClassAndVintage.find(
    (g) => g.key === `${AssetClass.OFFICE}:2024`
  );
  assert.ok(officeV2024);
  assert.equal(officeV2024.count, 1);
});

test('predictions with no matching realized price produce zero points', () => {
  const predictions = [prediction({ pnu: 'LONELY' })];
  const observations = [observation({ pnu: 'OTHER' })];
  const result = buildAnalysisBacktest({ predictions, observations });
  assert.equal(result.overall.count, 0);
  assert.equal(result.overall.mapePct, null);
  assert.equal(result.overall.meanBiasPct, null);
});
