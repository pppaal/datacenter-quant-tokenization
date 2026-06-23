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

import type { MacroSeries } from '@prisma/client';
import { buildMacroRegimeSnapshot } from '@/lib/services/macro/series';

function makeSeriesPoint(
  seriesKey: string,
  label: string,
  observationDate: Date,
  value: number
): MacroSeries {
  return {
    id: `${seriesKey}-${observationDate.toISOString()}`,
    assetId: null,
    market: 'KR',
    seriesKey,
    label,
    frequency: 'monthly',
    observationDate,
    value,
    unit: '%',
    sourceSystem: 'test',
    sourceStatus: SourceStatus.FRESH,
    sourceUpdatedAt: observationDate,
    citationId: null,
    createdAt: observationDate,
    updatedAt: observationDate
  } as MacroSeries;
}

test('buildMacroRegimeSnapshot.asOf reflects the latest observation, not the first label alphabetically', () => {
  // "Construction Cost Index" sorts before "Vacancy" alphabetically, but its
  // observation is older. asOf must report the freshest date across all series.
  const stale = new Date(Date.UTC(2026, 0, 1)); // Construction Cost Index
  const fresh = new Date(Date.UTC(2026, 4, 1)); // Vacancy (latest)
  const series = [
    makeSeriesPoint('construction_cost_index', 'Construction Cost Index', stale, 110),
    makeSeriesPoint('vacancy_pct', 'Vacancy', new Date(Date.UTC(2026, 3, 1)), 6),
    makeSeriesPoint('vacancy_pct', 'Vacancy', fresh, 7)
  ];

  const snapshot = buildMacroRegimeSnapshot(series);
  assert.ok(snapshot);
  assert.equal(snapshot!.asOf, fresh.toISOString());
});

test('buildMacroRegimeSnapshot.market reflects the freshest observation market', () => {
  const stale = makeSeriesPoint(
    'construction_cost_index',
    'Construction Cost Index',
    new Date(Date.UTC(2026, 0, 1)),
    110
  );
  // Override market on the freshest point.
  const freshObsDate = new Date(Date.UTC(2026, 5, 1));
  const fresh = {
    ...makeSeriesPoint('vacancy_pct', 'Vacancy', freshObsDate, 7),
    market: 'BUSAN'
  } as MacroSeries;

  const snapshot = buildMacroRegimeSnapshot([stale, fresh]);
  assert.ok(snapshot);
  assert.equal(snapshot!.market, 'BUSAN');
  assert.equal(snapshot!.asOf, freshObsDate.toISOString());
});
