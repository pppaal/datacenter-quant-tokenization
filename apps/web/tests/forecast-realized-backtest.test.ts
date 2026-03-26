import assert from 'node:assert/strict';
import test from 'node:test';
import { AssetClass } from '@prisma/client';
import { buildGradientBoostingRealizedBacktest } from '@/lib/services/forecast/realized-backtest';

function buildRun(index: number, value: number, dscr: number) {
  return {
    id: `run-${index}`,
    assetId: 'asset-1',
    createdAt: new Date(Date.UTC(2025, index, 1)),
    baseCaseValueKrw: value,
    confidenceScore: 72,
    assumptions: {
      occupancyPct: 90 + index,
      capRatePct: 5.5 + index * 0.05,
      discountRatePct: 8 + index * 0.05,
      debtCostPct: 4.5 + index * 0.05,
      macroRegime: {
        impacts: {
          dimensions: [
            { key: 'pricing', score: -0.3 + index * 0.05 },
            { key: 'leasing', score: 0.2 + index * 0.03 },
            { key: 'financing', score: -0.2 + index * 0.04 },
            { key: 'refinancing', score: -0.15 + index * 0.02 },
            { key: 'allocation', score: 0.1 + index * 0.02 }
          ]
        }
      }
    },
    asset: {
      id: 'asset-1',
      name: 'Asset One',
      assetCode: 'A-1',
      assetClass: AssetClass.OFFICE,
      market: 'US'
    },
    scenarios: [
      {
        name: 'Bull',
        debtServiceCoverage: dscr + 0.1
      },
      {
        name: 'Base',
        debtServiceCoverage: dscr
      },
      {
        name: 'Bear',
        debtServiceCoverage: dscr - 0.1
      }
    ]
  };
}

test('gradient boosting realized backtest compares predicted drift with realized outcomes', () => {
  const backtest = buildGradientBoostingRealizedBacktest({
    runs: [
      buildRun(0, 100_000, 1.4),
      buildRun(1, 102_000, 1.42),
      buildRun(2, 105_000, 1.45),
      buildRun(3, 108_000, 1.47),
      buildRun(4, 112_000, 1.5),
      buildRun(5, 115_000, 1.53)
    ],
    outcomes: [
      {
        id: 'outcome-1',
        assetId: 'asset-1',
        observationDate: new Date(Date.UTC(2025, 5, 20)),
        valuationKrw: 118_000,
        debtServiceCoverage: 1.56
      }
    ]
  });

  assert.equal(backtest.summary.matchedForecastCount, 1);
  assert.equal(backtest.summary.assetCoverage, 1);
  assert.ok(backtest.summary.directionalHitRatePct !== null);
  assert.ok(backtest.summary.meanAbsoluteValueErrorPct !== null);
  assert.equal(backtest.rows.length, 1);
  assert.equal(backtest.rows[0]?.runId, 'run-5');
});
