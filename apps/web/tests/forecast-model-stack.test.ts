import assert from 'node:assert/strict';
import test from 'node:test';
import { AssetClass } from '@prisma/client';
import { buildForecastModelStack } from '@/lib/services/forecast/model-stack';

test('forecast model stack reports live and building models from current data coverage', () => {
  const stack = buildForecastModelStack({
    assets: [
      {
        market: 'US',
        assetClass: AssetClass.OFFICE,
        transactionComps: [{}],
        rentComps: [{}],
        marketIndicatorSeries: [{}],
        valuations: [{}, {}, {}],
        documents: [{}, {}],
        counterparties: [{ financialStatements: [{}, {}] }]
      },
      {
        market: 'KR',
        assetClass: AssetClass.DATA_CENTER,
        transactionComps: [{}],
        rentComps: [],
        marketIndicatorSeries: [{}],
        valuations: [{}, {}],
        documents: [{}],
        counterparties: [{ financialStatements: [{}] }]
      }
    ],
    documents: [{}, {}, {}],
    macroObservationCount: 180,
    realizedBacktest: {
      summary: {
        matchedForecastCount: 8,
        assetCoverage: 2,
        directionalHitRatePct: 72,
        meanAbsoluteValueErrorPct: 6.5,
        meanAbsoluteDscrErrorPct: 4.2
      },
      rows: []
    }
  });

  assert.equal(stack.features.marketCount, 2);
  assert.equal(stack.summary.buildableModels > 0, true);
  assert.equal(
    stack.models.some((model) => model.key === 'monte-carlo-envelope' && model.status === 'READY'),
    true
  );
  assert.equal(
    stack.models.some((model) => model.key === 'deep-tft-model'),
    true
  );
  const gradientBoosting = stack.models.find((model) => model.key === 'gradient-boosting-forecast');
  assert.ok(gradientBoosting);
  assert.equal(gradientBoosting?.validationScore !== null, true);
  assert.equal(typeof gradientBoosting?.ranking, 'number');
});
