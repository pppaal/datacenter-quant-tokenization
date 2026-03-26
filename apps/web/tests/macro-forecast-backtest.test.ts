import assert from 'node:assert/strict';
import test from 'node:test';
import type { MacroFactor } from '@prisma/client';
import { buildMacroForecastBacktest } from '@/lib/services/macro/forecast-backtest';

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
    updatedAt: input.updatedAt ?? new Date('2026-03-25T00:00:00.000Z')
  };
}

test('buildMacroForecastBacktest summarizes next-value prediction accuracy', () => {
  const result = buildMacroForecastBacktest([
    factor({ market: 'US', factorKey: 'rate_level', label: 'Rate Level', value: 5.0, direction: 'NEUTRAL', observationDate: new Date('2026-01-01T00:00:00.000Z') }),
    factor({ market: 'US', factorKey: 'rate_level', label: 'Rate Level', value: 5.5, direction: 'NEGATIVE', observationDate: new Date('2026-02-01T00:00:00.000Z') }),
    factor({ market: 'US', factorKey: 'rate_level', label: 'Rate Level', value: 6.0, direction: 'NEGATIVE', observationDate: new Date('2026-03-01T00:00:00.000Z') }),
    factor({ market: 'US', factorKey: 'rate_level', label: 'Rate Level', value: 6.4, direction: 'NEGATIVE', observationDate: new Date('2026-04-01T00:00:00.000Z') }),
    factor({ market: 'KR', factorKey: 'growth_momentum', label: 'Growth Momentum', value: 1.8, direction: 'NEUTRAL', observationDate: new Date('2026-01-01T00:00:00.000Z') }),
    factor({ market: 'KR', factorKey: 'growth_momentum', label: 'Growth Momentum', value: 2.1, direction: 'POSITIVE', observationDate: new Date('2026-02-01T00:00:00.000Z') }),
    factor({ market: 'KR', factorKey: 'growth_momentum', label: 'Growth Momentum', value: 2.4, direction: 'POSITIVE', observationDate: new Date('2026-03-01T00:00:00.000Z') })
  ]);

  assert.equal(result.summary.marketCoverage, 2);
  assert.equal(result.summary.sampleCount, 3);
  assert.ok(result.summary.directionalHitRatePct >= 50);
  assert.ok(result.summary.meanAbsoluteErrorPct >= 0);
  assert.ok(result.markets.some((market) => market.market === 'US'));
});
