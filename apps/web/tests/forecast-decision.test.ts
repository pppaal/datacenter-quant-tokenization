import assert from 'node:assert/strict';
import test from 'node:test';
import { AssetClass } from '@prisma/client';
import { buildForecastDecisionGuide } from '@/lib/services/forecast/decision';

test('forecast decision guide prefers ML for asset drift when learned forecast is ready', () => {
  const currentRun = {
    id: 'run-current',
    assetId: 'asset-1',
    createdAt: new Date('2026-03-01T00:00:00.000Z'),
    baseCaseValueKrw: 100_000_000_000,
    confidenceScore: 78,
    assumptions: {
      macroRegime: {
        impacts: {
          dimensions: []
        }
      }
    },
    asset: {
      id: 'asset-1',
      name: 'Seoul Office',
      assetCode: 'SEOUL-OFFICE-01',
      market: 'KR',
      assetClass: AssetClass.OFFICE
    },
    scenarios: [
      { name: 'Bull', debtServiceCoverage: 1.4 },
      { name: 'Base', debtServiceCoverage: 1.3 },
      { name: 'Bear', debtServiceCoverage: 1.1 }
    ]
  };

  const historyRuns = [
    currentRun,
    {
      ...currentRun,
      id: 'run-prev',
      createdAt: new Date('2025-12-01T00:00:00.000Z'),
      baseCaseValueKrw: 96_000_000_000
    },
    {
      ...currentRun,
      id: 'run-prev-2',
      assetId: 'asset-2',
      asset: {
        id: 'asset-2',
        name: 'Busan Office',
        assetCode: 'BUSAN-OFFICE-01',
        market: 'KR',
        assetClass: AssetClass.OFFICE
      },
      createdAt: new Date('2025-11-01T00:00:00.000Z'),
      baseCaseValueKrw: 88_000_000_000
    },
    {
      ...currentRun,
      id: 'run-prev-3',
      assetId: 'asset-2',
      asset: {
        id: 'asset-2',
        name: 'Busan Office',
        assetCode: 'BUSAN-OFFICE-01',
        market: 'KR',
        assetClass: AssetClass.OFFICE
      },
      createdAt: new Date('2026-02-01T00:00:00.000Z'),
      baseCaseValueKrw: 92_000_000_000
    },
    {
      ...currentRun,
      id: 'run-prev-4',
      assetId: 'asset-3',
      asset: {
        id: 'asset-3',
        name: 'Incheon Industrial',
        assetCode: 'INCHEON-IND-01',
        market: 'KR',
        assetClass: AssetClass.INDUSTRIAL
      },
      createdAt: new Date('2025-10-01T00:00:00.000Z'),
      baseCaseValueKrw: 70_000_000_000
    },
    {
      ...currentRun,
      id: 'run-prev-5',
      assetId: 'asset-3',
      asset: {
        id: 'asset-3',
        name: 'Incheon Industrial',
        assetCode: 'INCHEON-IND-01',
        market: 'KR',
        assetClass: AssetClass.INDUSTRIAL
      },
      createdAt: new Date('2026-01-10T00:00:00.000Z'),
      baseCaseValueKrw: 73_000_000_000
    }
  ];

  const guide = buildForecastDecisionGuide({
    currentRun,
    historyRuns,
    marketFactors: [
      {
        market: 'KR',
        observationDate: new Date('2025-12-01T00:00:00.000Z'),
        factorKey: 'rate_level',
        label: 'Rate Level',
        value: 3.2,
        direction: 'NEGATIVE'
      },
      {
        market: 'KR',
        observationDate: new Date('2026-01-01T00:00:00.000Z'),
        factorKey: 'rate_level',
        label: 'Rate Level',
        value: 3.3,
        direction: 'NEGATIVE'
      },
      {
        market: 'KR',
        observationDate: new Date('2026-02-01T00:00:00.000Z'),
        factorKey: 'rate_level',
        label: 'Rate Level',
        value: 3.4,
        direction: 'NEGATIVE'
      }
    ],
    realizedOutcomes: [
      {
        assetId: 'asset-1',
        observationDate: new Date('2026-03-20T00:00:00.000Z'),
        valuationKrw: 102_000_000_000,
        debtServiceCoverage: 1.34
      },
      {
        assetId: 'asset-2',
        observationDate: new Date('2026-02-20T00:00:00.000Z'),
        valuationKrw: 94_000_000_000,
        debtServiceCoverage: 1.28
      },
      {
        assetId: 'asset-3',
        observationDate: new Date('2026-02-25T00:00:00.000Z'),
        valuationKrw: 74_000_000_000,
        debtServiceCoverage: 1.22
      }
    ],
    sensitivityRuns: [{ runType: 'MONTE_CARLO' }],
    boostedForecast: {
      status: 'READY',
      sampleCount: 12,
      assetCoverage: 3,
      forecastHorizonMonths: 12,
      predictedValueChangePct: 2.2,
      predictedDscrChangePct: 1.4,
      predictedValueKrw: 102_200_000_000,
      predictedDscr: 1.32,
      topDrivers: [],
      commentary: 'ready'
    }
  });

  assert.equal(guide.useCases.find((useCase) => useCase.key === 'market-nowcast')?.recommendedModelKey, 'macro-regime-nowcast');
  assert.equal(guide.useCases.find((useCase) => useCase.key === 'committee-downside')?.recommendedModelKey, 'monte-carlo-envelope');
  assert.equal(guide.useCases.find((useCase) => useCase.key === 'asset-drift')?.recommendedModelKey, 'gradient-boosting-forecast');
});
