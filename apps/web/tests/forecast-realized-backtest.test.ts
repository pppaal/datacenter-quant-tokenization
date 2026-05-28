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

test('realized backtest only matches horizon-aligned (~12mo) outcomes', () => {
  // Runs at month 0..5 of 2025. An outcome ~5 months after the last run is OUT
  // of the 12-month horizon band and must NOT be matched (the old code wrongly
  // matched any future outcome regardless of horizon).
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
        id: 'outcome-out-of-band',
        assetId: 'asset-1',
        observationDate: new Date(Date.UTC(2025, 5, 20)),
        valuationKrw: 118_000,
        debtServiceCoverage: 1.56
      }
    ]
  });

  assert.equal(backtest.summary.matchedForecastCount, 0);
  assert.equal(backtest.summary.horizonMonths, 12);
  assert.equal(backtest.summary.outOfSample.status, 'INSUFFICIENT_HISTORY');
});
