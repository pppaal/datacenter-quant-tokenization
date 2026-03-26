import assert from 'node:assert/strict';
import test from 'node:test';
import { AssetClass } from '@prisma/client';
import {
  buildRealizedOutcomeComparison,
  buildRealizedOutcomeSummary
} from '@/lib/services/realized-outcomes';

test('buildRealizedOutcomeComparison matches the first realized observation after a run', () => {
  const comparison = buildRealizedOutcomeComparison({
    run: {
      id: 'run-1',
      assetId: 'asset-1',
      createdAt: new Date('2026-01-15T00:00:00.000Z'),
      baseCaseValueKrw: 100_000,
      assumptions: {
        occupancyPct: 91
      },
      asset: {
        id: 'asset-1',
        name: 'Seoul Office',
        assetCode: 'SEOUL-OFF-01',
        assetClass: AssetClass.OFFICE
      },
      scenarios: [
        {
          name: 'Base',
          debtServiceCoverage: 1.4
        }
      ]
    },
    outcomes: [
      {
        id: 'outcome-early',
        assetId: 'asset-1',
        observationDate: new Date('2026-01-10T00:00:00.000Z'),
        occupancyPct: 88,
        noiKrw: 8_000,
        rentGrowthPct: -1,
        valuationKrw: 96_000,
        debtServiceCoverage: 1.28,
        exitCapRatePct: 6.2,
        notes: 'Too early'
      },
      {
        id: 'outcome-match',
        assetId: 'asset-1',
        observationDate: new Date('2026-03-01T00:00:00.000Z'),
        occupancyPct: 89,
        noiKrw: 8_500,
        rentGrowthPct: -0.5,
        valuationKrw: 95_000,
        debtServiceCoverage: 1.3,
        exitCapRatePct: 6.4,
        notes: 'Observed after run'
      }
    ],
    forecast: {
      status: 'READY',
      sampleCount: 12,
      assetCoverage: 4,
      forecastHorizonMonths: 12,
      predictedValueChangePct: -3,
      predictedDscrChangePct: -5,
      predictedValueKrw: 97_000,
      predictedDscr: 1.33,
      topDrivers: [],
      commentary: 'test forecast'
    }
  });

  assert.equal(comparison.status, 'MATCHED');
  assert.ok(comparison.match);
  assert.equal(comparison.match?.outcomeId, 'outcome-match');
  assert.equal(comparison.match?.actualValueChangePct, -5);
  assert.equal(comparison.match?.actualDscrChangePct, -7.1);
  assert.equal(comparison.match?.occupancyGapPct, -2);
  assert.equal(comparison.match?.valueForecastErrorPct, -2);
});

test('buildRealizedOutcomeSummary aggregates latest-run realized drift', () => {
  const summary = buildRealizedOutcomeSummary({
    runs: [
      {
        id: 'run-a',
        assetId: 'asset-a',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        baseCaseValueKrw: 100_000,
        asset: {
          id: 'asset-a',
          name: 'Asset A',
          assetCode: 'A-1',
          assetClass: AssetClass.OFFICE
        },
        scenarios: [
          {
            name: 'Base',
            debtServiceCoverage: 1.4
          }
        ]
      },
      {
        id: 'run-b',
        assetId: 'asset-b',
        createdAt: new Date('2026-01-05T00:00:00.000Z'),
        baseCaseValueKrw: 200_000,
        asset: {
          id: 'asset-b',
          name: 'Asset B',
          assetCode: 'B-1',
          assetClass: AssetClass.INDUSTRIAL
        },
        scenarios: [
          {
            name: 'Base',
            debtServiceCoverage: 1.6
          }
        ]
      }
    ],
    outcomes: [
      {
        id: 'outcome-a',
        assetId: 'asset-a',
        observationDate: new Date('2026-02-01T00:00:00.000Z'),
        occupancyPct: 90,
        noiKrw: 9_000,
        rentGrowthPct: 1,
        valuationKrw: 92_000,
        debtServiceCoverage: 1.3,
        exitCapRatePct: 6.5,
        notes: null
      },
      {
        id: 'outcome-b',
        assetId: 'asset-b',
        observationDate: new Date('2026-02-10T00:00:00.000Z'),
        occupancyPct: 94,
        noiKrw: 18_000,
        rentGrowthPct: 0.5,
        valuationKrw: 210_000,
        debtServiceCoverage: 1.7,
        exitCapRatePct: 5.8,
        notes: null
      }
    ]
  });

  assert.equal(summary.assetCoverage, 2);
  assert.equal(summary.matchedRunCount, 2);
  assert.equal(summary.meanAbsoluteValueChangePct, 6.5);
  assert.ok(summary.watchlist.length > 0);
});
