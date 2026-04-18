import assert from 'node:assert/strict';
import test from 'node:test';
import type { MacroFactor } from '@prisma/client';
import { buildMacroBacktest } from '@/lib/services/macro/backtest';

function factor(input: Partial<MacroFactor> & Pick<MacroFactor, 'market' | 'factorKey' | 'label' | 'value' | 'direction'>): MacroFactor {
  return {
    id: input.id ?? `${input.market}-${input.factorKey}-${input.observationDate?.toISOString() ?? 'now'}`,
    assetId: input.assetId ?? null,
    market: input.market,
    factorKey: input.factorKey,
    label: input.label,
    observationDate: input.observationDate ?? new Date('2026-03-25T00:00:00.000Z'),
    value: input.value,
    unit: input.unit ?? '%',
    direction: input.direction,
    commentary: input.commentary ?? '',
    sourceSystem: input.sourceSystem ?? 'test',
    sourceStatus: input.sourceStatus ?? 'FRESH',
    sourceUpdatedAt: input.sourceUpdatedAt ?? new Date('2026-03-25T00:00:00.000Z'),
    createdAt: input.createdAt ?? new Date('2026-03-25T00:00:00.000Z'),
    updatedAt: input.updatedAt ?? new Date('2026-03-25T00:00:00.000Z'),
    trendDirection: input.trendDirection ?? null,
    trendMomentum: input.trendMomentum ?? null,
    trendAcceleration: input.trendAcceleration ?? null,
    anomalyZScore: input.anomalyZScore ?? null,
    movingAvg3: input.movingAvg3 ?? null,
    movingAvg6: input.movingAvg6 ?? null,
    movingAvg12: input.movingAvg12 ?? null
  };
}

test('buildMacroBacktest summarizes directional hit rates by market', () => {
  const backtest = buildMacroBacktest([
    factor({
      market: 'US',
      factorKey: 'rate_level',
      label: 'Rate Level',
      value: 6.1,
      direction: 'NEGATIVE',
      observationDate: new Date('2026-01-01T00:00:00.000Z')
    }),
    factor({
      market: 'US',
      factorKey: 'rate_level',
      label: 'Rate Level',
      value: 6.2,
      direction: 'NEGATIVE',
      observationDate: new Date('2026-02-01T00:00:00.000Z')
    }),
    factor({
      market: 'US',
      factorKey: 'rate_level',
      label: 'Rate Level',
      value: 5.8,
      direction: 'NEUTRAL',
      observationDate: new Date('2026-03-01T00:00:00.000Z')
    }),
    factor({
      market: 'US',
      factorKey: 'liquidity',
      label: 'Liquidity',
      value: 80,
      direction: 'NEGATIVE',
      observationDate: new Date('2026-01-01T00:00:00.000Z')
    }),
    factor({
      market: 'US',
      factorKey: 'liquidity',
      label: 'Liquidity',
      value: 78,
      direction: 'NEGATIVE',
      observationDate: new Date('2026-02-01T00:00:00.000Z')
    }),
    factor({
      market: 'KR',
      factorKey: 'growth_momentum',
      label: 'Growth Momentum',
      value: 2.2,
      direction: 'POSITIVE',
      observationDate: new Date('2026-01-01T00:00:00.000Z')
    }),
    factor({
      market: 'KR',
      factorKey: 'growth_momentum',
      label: 'Growth Momentum',
      value: 2.6,
      direction: 'POSITIVE',
      observationDate: new Date('2026-02-01T00:00:00.000Z')
    })
  ]);

  assert.equal(backtest.summary.marketCoverage, 2);
  assert.equal(backtest.summary.totalTransitions, 4);
  assert.ok(backtest.summary.overallHitRatePct > 50);
  assert.ok(backtest.markets.some((market) => market.market === 'US'));
  assert.ok(backtest.markets.some((market) => market.market === 'KR'));
});
