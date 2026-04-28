import assert from 'node:assert/strict';
import test from 'node:test';
import { SourceStatus } from '@prisma/client';
import {
  buildQuantAllocationView,
  buildQuantAssetClassAllocationView,
  buildQuantMarketSignals
} from '@/lib/services/macro/quant';

test('quant macro consumer builds cross-asset signals from persisted factors', () => {
  const asOf = new Date('2026-03-01T00:00:00.000Z');

  const signals = buildQuantMarketSignals([
    {
      id: '1',
      assetId: null,
      market: 'US',
      factorKey: 'liquidity',
      label: 'Liquidity',
      observationDate: asOf,
      value: 109,
      unit: 'idx',
      direction: 'POSITIVE',
      commentary: 'Liquidity is healthy.',
      sourceSystem: 'macro-factor-engine',
      sourceStatus: SourceStatus.FRESH,
      sourceUpdatedAt: asOf,
      createdAt: asOf,
      updatedAt: asOf,
      trendDirection: null,
      trendMomentum: null,
      trendAcceleration: null,
      anomalyZScore: null,
      movingAvg3: null,
      movingAvg6: null,
      movingAvg12: null
    },
    {
      id: '2',
      assetId: null,
      market: 'US',
      factorKey: 'growth_momentum',
      label: 'Growth Momentum',
      observationDate: asOf,
      value: 2.8,
      unit: '%',
      direction: 'POSITIVE',
      commentary: 'Growth is supportive.',
      sourceSystem: 'macro-factor-engine',
      sourceStatus: SourceStatus.FRESH,
      sourceUpdatedAt: asOf,
      createdAt: asOf,
      updatedAt: asOf,
      trendDirection: null,
      trendMomentum: null,
      trendAcceleration: null,
      anomalyZScore: null,
      movingAvg3: null,
      movingAvg6: null,
      movingAvg12: null
    },
    {
      id: '3',
      assetId: null,
      market: 'US',
      factorKey: 'credit_stress',
      label: 'Credit Stress',
      observationDate: asOf,
      value: 145,
      unit: 'bps',
      direction: 'POSITIVE',
      commentary: 'Credit is constructive.',
      sourceSystem: 'macro-factor-engine',
      sourceStatus: SourceStatus.FRESH,
      sourceUpdatedAt: asOf,
      createdAt: asOf,
      updatedAt: asOf,
      trendDirection: null,
      trendMomentum: null,
      trendAcceleration: null,
      anomalyZScore: null,
      movingAvg3: null,
      movingAvg6: null,
      movingAvg12: null
    },
    {
      id: '4',
      assetId: null,
      market: 'US',
      factorKey: 'rate_level',
      label: 'Rate Level',
      observationDate: asOf,
      value: 4.2,
      unit: '%',
      direction: 'POSITIVE',
      commentary: 'Rates are supportive.',
      sourceSystem: 'macro-factor-engine',
      sourceStatus: SourceStatus.FRESH,
      sourceUpdatedAt: asOf,
      createdAt: asOf,
      updatedAt: asOf,
      trendDirection: null,
      trendMomentum: null,
      trendAcceleration: null,
      anomalyZScore: null,
      movingAvg3: null,
      movingAvg6: null,
      movingAvg12: null
    },
    {
      id: '5',
      assetId: null,
      market: 'US',
      factorKey: 'rate_momentum_bps',
      label: 'Rate Momentum',
      observationDate: asOf,
      value: -35,
      unit: 'bps',
      direction: 'POSITIVE',
      commentary: 'Rates are easing.',
      sourceSystem: 'macro-factor-engine',
      sourceStatus: SourceStatus.FRESH,
      sourceUpdatedAt: asOf,
      createdAt: asOf,
      updatedAt: asOf,
      trendDirection: null,
      trendMomentum: null,
      trendAcceleration: null,
      anomalyZScore: null,
      movingAvg3: null,
      movingAvg6: null,
      movingAvg12: null
    },
    {
      id: '6',
      assetId: null,
      market: 'US',
      factorKey: 'property_demand',
      label: 'Property Demand',
      observationDate: asOf,
      value: 12,
      unit: 'score',
      direction: 'POSITIVE',
      commentary: 'Property demand is constructive.',
      sourceSystem: 'macro-factor-engine',
      sourceStatus: SourceStatus.FRESH,
      sourceUpdatedAt: asOf,
      createdAt: asOf,
      updatedAt: asOf,
      trendDirection: null,
      trendMomentum: null,
      trendAcceleration: null,
      anomalyZScore: null,
      movingAvg3: null,
      movingAvg6: null,
      movingAvg12: null
    },
    {
      id: '7',
      assetId: null,
      market: 'US',
      factorKey: 'construction_pressure',
      label: 'Construction Pressure',
      observationDate: asOf,
      value: 11,
      unit: 'score',
      direction: 'NEUTRAL',
      commentary: 'Construction is stable.',
      sourceSystem: 'macro-factor-engine',
      sourceStatus: SourceStatus.FRESH,
      sourceUpdatedAt: asOf,
      createdAt: asOf,
      updatedAt: asOf,
      trendDirection: null,
      trendMomentum: null,
      trendAcceleration: null,
      anomalyZScore: null,
      movingAvg3: null,
      movingAvg6: null,
      movingAvg12: null
    },
    {
      id: '8',
      assetId: null,
      market: 'US',
      factorKey: 'inflation_trend',
      label: 'Inflation Trend',
      observationDate: asOf,
      value: 2.2,
      unit: '%',
      direction: 'POSITIVE',
      commentary: 'Inflation is contained.',
      sourceSystem: 'macro-factor-engine',
      sourceStatus: SourceStatus.FRESH,
      sourceUpdatedAt: asOf,
      createdAt: asOf,
      updatedAt: asOf,
      trendDirection: null,
      trendMomentum: null,
      trendAcceleration: null,
      anomalyZScore: null,
      movingAvg3: null,
      movingAvg6: null,
      movingAvg12: null
    }
  ]);

  assert.equal(signals.length, 1);
  assert.equal(signals[0]?.market, 'US');
  assert.equal(signals[0]?.signals.find((signal) => signal.key === 'risk')?.stance, 'RISK_ON');
  assert.equal(
    signals[0]?.signals.find((signal) => signal.key === 'duration')?.stance,
    'LONG_DURATION'
  );
  assert.equal(signals[0]?.signals.find((signal) => signal.key === 'credit')?.stance, 'OVERWEIGHT');
  assert.equal(
    signals[0]?.signals.find((signal) => signal.key === 'realAssets')?.stance,
    'OVERWEIGHT'
  );

  const allocation = buildQuantAllocationView(signals);
  assert.equal(allocation.length, 1);
  assert.equal(allocation[0]?.market, 'US');
  assert.equal(allocation[0]?.stance, 'OVERWEIGHT');
  assert.ok((allocation[0]?.score ?? 0) > 0.75);

  const assetClassAllocation = buildQuantAssetClassAllocationView(signals);
  const office = assetClassAllocation.find(
    (item) => item.market === 'US' && item.assetClass === 'OFFICE'
  );
  const dataCenter = assetClassAllocation.find(
    (item) => item.market === 'US' && item.assetClass === 'DATA_CENTER'
  );

  assert.ok(office);
  assert.ok(dataCenter);
  assert.equal(office?.stance, 'OVERWEIGHT');
  assert.equal(dataCenter?.stance, 'OVERWEIGHT');
  assert.ok((dataCenter?.score ?? 0) > (office?.score ?? 0));
});
