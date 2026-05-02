import assert from 'node:assert/strict';
import test from 'node:test';
import { SourceStatus, TaskStatus } from '@prisma/client';
import {
  extractKoreaPublicDatasetMetrics,
  listKoreaPublicDatasetDefinitions
} from '@/lib/sources/adapters/korea-public';
import {
  buildResearchCoverageSurface,
  flattenNumericMetrics,
  shouldRefreshResearchWorkspace
} from '@/lib/services/research/workspace';

test('buildResearchCoverageSurface summarizes freshness and open coverage tasks', () => {
  const surface = buildResearchCoverageSurface({
    assetCode: 'SEOUL-YEOUIDO-01',
    researchSnapshots: [
      {
        freshnessStatus: SourceStatus.STALE,
        freshnessLabel: '42d old',
        title: 'Office asset dossier'
      }
    ],
    coverageTasks: [{ status: TaskStatus.OPEN }, { status: TaskStatus.DONE }]
  });

  assert.equal(surface.freshnessStatus, SourceStatus.STALE);
  assert.equal(surface.openTaskCount, 1);
  assert.ok(surface.headline.includes('open research task'));
});

test('shouldRefreshResearchWorkspace only refreshes when persisted research is incomplete', () => {
  assert.equal(
    shouldRefreshResearchWorkspace({
      latestOfficialSyncAt: new Date('2026-04-03T00:00:00.000Z'),
      latestAssetSyncAt: new Date('2026-04-03T00:00:00.000Z'),
      staleAssetDossierCount: 0,
      staleOfficialSourceCount: 0
    }),
    false
  );

  assert.equal(
    shouldRefreshResearchWorkspace({
      latestOfficialSyncAt: null,
      latestAssetSyncAt: new Date('2026-04-03T00:00:00.000Z'),
      staleAssetDossierCount: 0,
      staleOfficialSourceCount: 0
    }),
    true
  );
});

test('flattenNumericMetrics extracts nested numeric official-source fields for normalized persistence', () => {
  const metrics = flattenNumericMetrics({
    headlineVacancyPct: 6.2,
    office: {
      capRatePct: 4.8,
      rent: {
        monthlyRentKrwPerSqm: 39200
      }
    },
    note: 'ignore text'
  });

  assert.deepEqual(
    metrics.map((item) => item.key),
    ['headlineVacancyPct', 'office.capRatePct', 'office.rent.monthlyRentKrwPerSqm']
  );
});

test('extractKoreaPublicDatasetMetrics uses dataset-aware mappings for official-source normalization', () => {
  const definition = listKoreaPublicDatasetDefinitions().find(
    (item) => item.key === 'reb_property_statistics'
  );
  assert.ok(definition);

  const metrics = extractKoreaPublicDatasetMetrics(definition, {
    office: {
      vacancyPct: 7.1,
      capRatePct: 4.9
    },
    industrial: {
      rentGrowthPct: 2.8
    }
  });

  assert.deepEqual(
    metrics.map((item) => item.normalizedKey),
    ['office.vacancy_pct', 'office.cap_rate_pct', 'industrial.rent_growth_pct']
  );
  assert.equal(metrics[0]?.target, 'market');
});
