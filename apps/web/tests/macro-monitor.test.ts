import assert from 'node:assert/strict';
import test from 'node:test';
import type { MacroFactor } from '@prisma/client';
import { buildMacroMonitor } from '@/lib/services/macro/monitor';
import { buildQuantAllocationView, buildQuantMarketSignals } from '@/lib/services/macro/quant';

function factor(input: Partial<MacroFactor> & Pick<MacroFactor, 'market' | 'factorKey' | 'label' | 'value' | 'direction'>): MacroFactor {
  return {
    id: input.id ?? `${input.market}-${input.factorKey}`,
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

test('buildMacroMonitor summarizes market headwinds and missing factors', () => {
  const factors = [
    factor({ market: 'US', factorKey: 'rate_level', label: 'Rate Level', value: 6.5, direction: 'NEGATIVE' }),
    factor({ market: 'US', factorKey: 'credit_stress', label: 'Credit Stress', value: 245, direction: 'NEGATIVE', unit: 'bps' }),
    factor({ market: 'US', factorKey: 'liquidity', label: 'Liquidity', value: 76, direction: 'NEGATIVE', unit: 'idx' }),
    factor({ market: 'US', factorKey: 'property_demand', label: 'Property Demand', value: 12, direction: 'POSITIVE', unit: 'score' }),
    factor({ market: 'KR', factorKey: 'rate_level', label: 'Rate Level', value: 4.2, direction: 'POSITIVE' }),
    factor({ market: 'KR', factorKey: 'liquidity', label: 'Liquidity', value: 108, direction: 'POSITIVE', unit: 'idx' }),
    factor({ market: 'KR', factorKey: 'growth_momentum', label: 'Growth Momentum', value: 2.8, direction: 'POSITIVE' }),
    factor({ market: 'KR', factorKey: 'property_demand', label: 'Property Demand', value: 10, direction: 'POSITIVE', unit: 'score' })
  ];

  const quantSignals = buildQuantMarketSignals(factors);
  const quantAllocation = buildQuantAllocationView(quantSignals);
  const monitor = buildMacroMonitor(factors, quantSignals, quantAllocation);

  assert.equal(monitor.summary.marketCoverage, 2);
  assert.equal(monitor.summary.stressedMarkets, 1);
  assert.equal(monitor.summary.supportiveMarkets, 1);

  const usRow = monitor.markets.find((market) => market.market === 'US');
  assert.ok(usRow);
  assert.equal(usRow?.strongestHeadwind, 'Liquidity');
  assert.equal(usRow?.strongestTailwind, 'Property Demand');
  assert.ok((usRow?.missingFactorCount ?? 0) > 0);

  const krRow = monitor.markets.find((market) => market.market === 'KR');
  assert.ok(krRow);
  assert.equal(krRow?.strongestTailwind, 'Property Demand');
});
