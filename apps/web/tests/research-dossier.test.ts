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
      capRatePct: 5.8,
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
      { id: 'ind-1', indicatorKey: 'office_vacancy_pct', value: 9.4, observationDate: now },
      { id: 'ind-2', indicatorKey: 'office_cap_rate_pct', value: 4.7, observationDate: now }
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
        snapshotType: 'asset-dossier',
        viewType: 'HOUSE',
        approvalStatus: 'APPROVED',
        title: 'Office asset dossier',
        summary: 'Approved Seoul office house view with disciplined vacancy and rent support.',
        sourceSystem: 'research-dossier',
        freshnessStatus: SourceStatus.FRESH,
        freshnessLabel: '2d old',
        snapshotDate: now,
        approvedAt: now
      },
      {
        id: 'research-2',
        snapshotType: 'market-official-source',
        viewType: 'SOURCE',
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
  assert.equal(dossier.marketThesis, 'Approved Seoul office house view with disciplined vacancy and rent support.');
  assert.ok(dossier.micro.scorecards.some((item) => item.label.includes('Lease / Revenue')));
  assert.equal(dossier.documents.anchoredDocumentCount, 1);
  assert.equal(dossier.latestValuationId, 'run-1');
  assert.equal(dossier.freshness.status, SourceStatus.FRESH);
  assert.equal(dossier.coverage.openTaskCount, 1);
  assert.equal(dossier.provenance.sourceCount, 2);
  assert.equal(dossier.market.officialHighlights[0]?.label, 'office cap rate pct');
  assert.equal(dossier.officialSources.highlights[0]?.label, 'Office Vacancy');
  assert.equal(dossier.houseView.approvalStatus, 'APPROVED');
  assert.equal(dossier.houseView.approvalLabel, 'approved house view');
  assert.equal(dossier.sourceView.title, 'REB Office indicators');
  assert.ok(dossier.confidence.score >= 58);
  assert.equal(dossier.confidence.level, 'moderate');
  assert.ok(dossier.confidence.conflicts.some((item) => item.label.includes('Vacancy')));
  assert.ok(dossier.confidence.conflicts.some((item) => item.label.includes('Cap-rate')));
});

test('research dossier reports low confidence when no research snapshots exist', () => {
  const bareAsset = {
    id: 'bare-asset',
    name: 'Bare Asset',
    assetClass: 'OFFICE',
    assetCode: 'BARE-01',
    address: null,
    buildingSnapshot: null,
    siteProfile: null,
    marketSnapshot: null,
    macroSeries: [],
    macroFactors: [],
    marketIndicatorSeries: [],
    transactionComps: [],
    rentComps: [],
    pipelineProjects: [],
    ownershipRecords: [],
    encumbranceRecords: [],
    planningConstraints: [],
    leases: [],
    debtFacilities: [],
    taxAssumption: null,
    valuations: [],
    readinessProject: null,
    documents: [],
    researchSnapshots: [],
    coverageTasks: []
  };

  const dossier = buildAssetResearchDossier(bareAsset as any);
  assert.ok(dossier.confidence.score <= 58, `Expected low/moderate score, got ${dossier.confidence.score}`);
  assert.equal(dossier.confidence.level, 'low');
  assert.equal(dossier.provenance.sourceCount, 0);
  assert.equal(dossier.houseView.approvalStatus, null);
});

test('research dossier detects vacancy disagreement conflict', () => {
  const conflictAsset = {
    id: 'conflict-asset',
    name: 'Conflict Asset',
    assetClass: 'OFFICE',
    assetCode: 'CONFLICT-01',
    address: null,
    buildingSnapshot: null,
    siteProfile: null,
    marketSnapshot: {
      vacancyPct: 5.0,
      capRatePct: 4.5,
      discountRatePct: 7.0
    },
    macroSeries: [],
    macroFactors: [],
    marketIndicatorSeries: [
      { id: 'ind-1', indicatorKey: 'seoul_office_vacancy', label: 'Vacancy', value: 10.0, observationDate: new Date() }
    ],
    transactionComps: [],
    rentComps: [],
    pipelineProjects: [],
    ownershipRecords: [],
    encumbranceRecords: [],
    planningConstraints: [],
    leases: [],
    debtFacilities: [],
    taxAssumption: null,
    valuations: [],
    readinessProject: null,
    documents: [],
    researchSnapshots: [
      {
        title: 'Source view',
        snapshotType: 'official-source',
        viewType: 'SOURCE',
        approvalStatus: 'APPROVED',
        snapshotDate: new Date(),
        sourceSystem: 'kosis',
        freshnessStatus: 'FRESH',
        freshnessLabel: '1d old',
        metrics: { highlights: [{ label: 'Vacancy', value: '10%' }] }
      }
    ],
    coverageTasks: []
  };

  const dossier = buildAssetResearchDossier(conflictAsset as any);
  assert.ok(dossier.confidence.conflicts.length > 0, 'Expected at least one conflict');
  const vacancyConflict = dossier.confidence.conflicts.find((c) => c.label === 'Vacancy disagreement');
  assert.ok(vacancyConflict, 'Expected vacancy disagreement conflict');
  assert.equal(vacancyConflict?.severity, 'danger');
});
