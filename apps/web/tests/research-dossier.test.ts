import assert from 'node:assert/strict';
import test from 'node:test';
import { AssetClass, ReviewStatus, SourceStatus } from '@prisma/client';
import { buildAssetResearchDossier } from '@/lib/services/research/dossier';

test('research dossier aggregates macro, market, micro, and document context for office assets', () => {
  const now = new Date('2026-03-26T00:00:00.000Z');
  const dossier = buildAssetResearchDossier({
    id: 'asset-1',
    assetClass: AssetClass.OFFICE,
    assetCode: 'SEOUL-YEOUIDO-01',
    name: 'Yeouido Core Office Tower',
    address: { city: 'Seoul', province: 'Seoul', country: 'KR', parcelId: '11-1234-5678' },
    siteProfile: { siteNotes: 'Prime office corridor' },
    buildingSnapshot: { structureDescription: 'High-rise office tower' },
    marketSnapshot: {
      metroRegion: 'Yeouido',
      vacancyPct: 6.2,
      capRatePct: 4.8,
      discountRatePct: 7.4,
      debtCostPct: 4.7,
      inflationPct: 2.1,
      marketNotes: 'Prime office leasing remains disciplined.'
    },
    macroFactors: [
      { factorKey: 'rate_level', label: 'Rate Level', value: 4.7, direction: 'NEGATIVE', observationDate: now },
      { factorKey: 'property_demand', label: 'Property Demand', value: 11, direction: 'POSITIVE', observationDate: now }
    ],
    marketIndicatorSeries: [
      { id: 'ind-1', indicatorKey: 'office_vacancy_pct', value: 6.2, observationDate: now }
    ],
    transactionComps: [{ id: 'tx-1', transactionDate: now, capRatePct: 4.7 }],
    rentComps: [{ id: 'rent-1', observationDate: now, monthlyRentPerSqmKrw: 39200, occupancyPct: 95 }],
    pipelineProjects: [{ id: 'pipe-1', projectName: 'Yeouido South Office Redevelopment', stageLabel: 'Pre-construction' }],
    ownershipRecords: [
      {
        id: 'own-1',
        ownerName: 'Han River Office Holdings',
        entityType: 'SPV',
        ownershipPct: 100,
        reviewStatus: ReviewStatus.APPROVED,
        updatedAt: now,
        reviewNotes: null,
        reviewedAt: now,
        reviewedById: null,
        sourceStatus: SourceStatus.FRESH,
        sourceUpdatedAt: now
      }
    ],
    encumbranceRecords: [],
    planningConstraints: [],
    leases: [
      {
        id: 'lease-1',
        tenantName: 'Domestic Securities House',
        status: 'ACTIVE',
        termYears: 5,
        notes: 'Anchor office tenant',
        reviewStatus: ReviewStatus.APPROVED,
        updatedAt: now,
        reviewNotes: null,
        reviewedAt: now,
        reviewedById: null
      }
    ],
    debtFacilities: [{ id: 'debt-1' }],
    taxAssumption: { id: 'tax-1' },
    documents: [
      {
        id: 'doc-1',
        currentVersion: 1,
        title: 'Office Rent Roll',
        documentType: 'LEASE',
        updatedAt: now,
        documentHash: 'abc123'
      }
    ],
    valuations: [{ id: 'run-1', runLabel: 'Seeded run', createdAt: now }],
    researchSnapshots: [
      {
        id: 'research-1',
        title: 'Office asset dossier',
        sourceSystem: 'research-dossier',
        freshnessStatus: SourceStatus.FRESH,
        freshnessLabel: '2d old',
        snapshotDate: now
      },
      {
        id: 'research-2',
        snapshotType: 'market-official-source',
        title: 'REB Office indicators',
        sourceSystem: 'korea-reb-property-statistics',
        freshnessStatus: SourceStatus.FRESH,
        freshnessLabel: 'fresh api',
        snapshotDate: now,
        metrics: {
          highlights: [
            {
              label: 'Office Vacancy',
              value: '7.1%'
            }
          ]
        }
      }
    ],
    coverageTasks: [
      {
        id: 'task-1',
        title: 'Refresh rent comp set',
        status: 'OPEN',
        priority: 'MEDIUM',
        notes: 'Need one more Yeouido rent comp',
        freshnessLabel: '2d old'
      }
    ],
    readinessProject: { onchainRecords: [{ recordType: 'REVIEW_PACKET', payload: { packetFingerprint: 'packet-1' } }, { recordType: 'DOCUMENT_HASH', txHash: '0xabc' }] }
  });

  assert.equal(dossier.playbook.label, 'Office');
  assert.ok(dossier.marketThesis.includes('office'));
  assert.ok(dossier.micro.scorecards.some((item) => item.label.includes('Lease / Revenue')));
  assert.equal(dossier.documents.anchoredDocumentCount, 1);
  assert.equal(dossier.latestValuationId, 'run-1');
  assert.equal(dossier.freshness.status, SourceStatus.FRESH);
  assert.equal(dossier.coverage.openTaskCount, 1);
  assert.equal(dossier.provenance.sourceCount, 2);
  assert.equal(dossier.market.officialHighlights[0]?.label, 'office vacancy pct');
  assert.equal(dossier.officialSources.highlights[0]?.label, 'Office Vacancy');
});
