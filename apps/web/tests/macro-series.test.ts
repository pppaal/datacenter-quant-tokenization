import assert from 'node:assert/strict';
import test from 'node:test';
import { SourceStatus } from '@prisma/client';
import { buildMacroSeriesCreateInputs } from '@/lib/services/macro/series';

test('macro series builder stores extended macro indicators when available', () => {
  const rows = buildMacroSeriesCreateInputs({
    market: 'KR',
    macro: {
      metroRegion: 'Seoul',
      vacancyPct: 7.1,
      colocationRatePerKwKrw: 205000,
      capRatePct: 6.2,
      debtCostPct: 5.4,
      inflationPct: 2.6,
      constructionCostPerMwKrw: 7600000000,
      discountRatePct: 8.9,
      policyRatePct: 3.5,
      creditSpreadBps: 185,
      rentGrowthPct: 2.1,
      transactionVolumeIndex: 94,
      constructionCostIndex: 116,
      marketNotes: 'Test macro payload'
    },
    sourceSystem: 'custom-macro-api',
    sourceStatus: SourceStatus.FRESH,
    sourceUpdatedAt: new Date('2026-03-01T00:00:00.000Z')
  });

  assert.ok(rows.some((row) => row.seriesKey === 'policy_rate_pct' && row.value === 3.5));
  assert.ok(rows.some((row) => row.seriesKey === 'credit_spread_bps' && row.value === 185));
  assert.ok(rows.some((row) => row.seriesKey === 'rent_growth_pct' && row.value === 2.1));
  assert.ok(rows.some((row) => row.seriesKey === 'transaction_volume_index' && row.value === 94));
  assert.ok(rows.some((row) => row.seriesKey === 'construction_cost_index' && row.value === 116));
});
