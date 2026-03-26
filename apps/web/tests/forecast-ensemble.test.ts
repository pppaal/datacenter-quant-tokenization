import assert from 'node:assert/strict';
import test from 'node:test';
import { AssetClass } from '@prisma/client';
import { buildForecastEnsemblePolicy } from '@/lib/services/forecast/ensemble';
import { buildForecastModelStack } from '@/lib/services/forecast/model-stack';

test('forecast ensemble policy ranks models by use case from readiness and validation', () => {
  const stack = buildForecastModelStack({
    assets: [
      {
        market: 'US',
        assetClass: AssetClass.OFFICE,
        transactionComps: [{}],
        rentComps: [{}],
        marketIndicatorSeries: [{}],
        valuations: [{}, {}, {}, {}, {}],
        counterparties: [{ financialStatements: [{}, {}] }]
      },
      {
        market: 'KR',
        assetClass: AssetClass.DATA_CENTER,
        transactionComps: [{}],
        rentComps: [{}],
        marketIndicatorSeries: [{}],
        valuations: [{}, {}, {}],
        counterparties: [{ financialStatements: [{}] }]
      }
    ],
    documents: [{}, {}, {}],
    macroObservationCount: 220,
    realizedBacktest: {
      summary: {
        matchedForecastCount: 10,
        assetCoverage: 3,
        directionalHitRatePct: 76,
        meanAbsoluteValueErrorPct: 6,
        meanAbsoluteDscrErrorPct: 4
      },
      rows: []
    }
  });

  const policy = buildForecastEnsemblePolicy({
    modelStack: stack,
    macroBacktest: {
      summary: {
        marketCoverage: 2,
        totalTransitions: 30,
        overallHitRatePct: 71,
        stableMarkets: 2,
        unstableMarkets: 0,
        latestObservationDate: '2026-03-01T00:00:00.000Z'
      },
      markets: []
    },
    macroForecastBacktest: {
      summary: {
        marketCoverage: 2,
        sampleCount: 20,
        directionalHitRatePct: 68,
        meanAbsoluteErrorPct: 7,
        latestActualDate: '2026-03-01T00:00:00.000Z'
      },
      markets: []
    },
    forecastRealizedBacktest: {
      summary: {
        matchedForecastCount: 10,
        assetCoverage: 3,
        directionalHitRatePct: 76,
        meanAbsoluteValueErrorPct: 6,
        meanAbsoluteDscrErrorPct: 4
      },
      rows: []
    }
  });

  assert.equal(policy.useCases.length, 3);
  assert.equal(policy.useCases[0]?.weights.length, 3);
  assert.equal(policy.useCases.find((useCase) => useCase.key === 'market-nowcast')?.championModelKey, 'macro-regime-nowcast');
  assert.equal(policy.useCases.find((useCase) => useCase.key === 'committee-downside')?.championModelKey, 'monte-carlo-envelope');
  assert.equal(policy.useCases.find((useCase) => useCase.key === 'asset-drift')?.championModelKey, 'gradient-boosting-forecast');
});
