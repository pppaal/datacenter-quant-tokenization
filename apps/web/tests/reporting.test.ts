import assert from 'node:assert/strict';
import test from 'node:test';
import { AssetClass } from '@prisma/client';
import {
  buildDealReport,
  buildDealReportPacket,
  buildReportBundleFromAsset,
  listReportTemplates,
  serializeReportPacketToMarkdown,
  serializeReportToMarkdown
} from '@/lib/services/reports';

function makeAssetStub() {
  return {
    id: 'asset-1',
    assetCode: 'KR-DC-001',
    slug: 'kr-dc-001',
    name: 'Seoul Edge Data Campus',
    assetClass: AssetClass.DATA_CENTER,
    market: 'KR',
    status: 'SCREENING',
    stage: 'DD',
    description: 'Special situation edge data center opportunity with near-term refinancing pressure.',
    ownerName: 'Edge Holdings',
    sponsorName: 'North River Capital',
    developmentSummary: 'Partial fit-out complete; power delivery and title clean-up remain gating items.',
    powerCapacityMw: 20,
    grossFloorAreaSqm: 28000,
    rentableAreaSqm: 26000,
    updatedAt: new Date('2026-03-26T00:00:00.000Z'),
    address: {
      city: 'Seoul',
      province: 'Seoul',
      country: 'KR'
    },
    siteProfile: {},
    permitSnapshot: {
      powerApprovalStatus: 'Conditional',
      reviewStatus: 'APPROVED',
      id: 'permit-1',
      reviewNotes: null,
      reviewedAt: new Date('2026-03-24T00:00:00.000Z'),
      reviewedById: 'user-1',
      sourceStatus: 'MANUAL',
      sourceUpdatedAt: new Date('2026-03-24T00:00:00.000Z'),
      updatedAt: new Date('2026-03-24T00:00:00.000Z')
    },
    energySnapshot: {
      tariffKrwPerKwh: 158,
      pueTarget: 1.29,
      reviewStatus: 'APPROVED',
      id: 'energy-1',
      reviewNotes: null,
      reviewedAt: new Date('2026-03-24T00:00:00.000Z'),
      reviewedById: 'user-1',
      sourceStatus: 'MANUAL',
      sourceUpdatedAt: new Date('2026-03-24T00:00:00.000Z'),
      updatedAt: new Date('2026-03-24T00:00:00.000Z')
    },
    capexLineItems: [{ id: 'cap-1' }, { id: 'cap-2' }, { id: 'cap-3' }, { id: 'cap-4' }],
    leases: [
      { id: 'lease-1', reviewStatus: 'APPROVED', reviewNotes: null, reviewedAt: new Date(), reviewedById: 'user-1', updatedAt: new Date() },
      { id: 'lease-2', reviewStatus: 'PENDING', reviewNotes: null, reviewedAt: null, reviewedById: null, updatedAt: new Date() }
    ],
    debtFacilities: [{ id: 'debt-1' }],
    ownershipRecords: [{ id: 'own-1', reviewStatus: 'APPROVED', updatedAt: new Date(), ownerName: 'Edge Holdings', entityType: 'SPV', ownershipPct: 100, reviewNotes: null, reviewedAt: new Date(), reviewedById: 'user-1', sourceStatus: 'MANUAL', sourceUpdatedAt: new Date() }],
    encumbranceRecords: [{ id: 'enc-1', reviewStatus: 'APPROVED', updatedAt: new Date(), encumbranceType: 'Mortgage', holderName: 'Infra Bank', securedAmountKrw: 42000000000, priorityRank: 1, reviewNotes: null, reviewedAt: new Date(), reviewedById: 'user-1', sourceStatus: 'MANUAL', sourceUpdatedAt: new Date() }],
    planningConstraints: [{ id: 'plan-1', reviewStatus: 'PENDING', updatedAt: new Date(), constraintType: 'Easement', title: 'Shared ingress', severity: 'Medium', description: 'Pending legal confirmation', reviewNotes: null, reviewedAt: null, reviewedById: null, sourceStatus: 'MANUAL', sourceUpdatedAt: new Date() }],
    featureSnapshots: [],
    researchSnapshots: [
      {
        id: 'research-1',
        snapshotType: 'asset-dossier',
        viewType: 'HOUSE',
        approvalStatus: 'APPROVED',
        title: 'National macro fabric',
        summary: 'Approved data-center house view remains conditionally investable with refinancing and legal cleanup focus.',
        freshnessStatus: 'STALE',
        freshnessLabel: '38d old',
        snapshotDate: new Date('2026-03-20T00:00:00.000Z'),
        sourceSystem: 'research-dossier'
      },
      {
        id: 'research-2',
        snapshotType: 'market-official-source',
        viewType: 'SOURCE',
        approvalStatus: 'APPROVED',
        title: 'REB Data Center indicators',
        freshnessStatus: 'FRESH',
        freshnessLabel: '7d old',
        snapshotDate: new Date('2026-03-25T00:00:00.000Z'),
        sourceSystem: 'korea-reb-property-statistics'
      }
    ],
    coverageTasks: [
      {
        id: 'coverage-1',
        title: 'Refresh transaction comps',
        status: 'OPEN',
        priority: 'HIGH',
        notes: 'Need one more Seoul office comp',
        freshnessLabel: '38d old'
      }
    ],
    comparableSet: {
      entries: [{ id: 'comp-1' }, { id: 'comp-2' }, { id: 'comp-3' }]
    },
    documents: [
      {
        id: 'doc-1',
        title: 'Title Extract',
        documentType: 'TITLE',
        currentVersion: 2,
        sourceLink: 'https://example.com/title',
        aiSummary: 'Current owner and mortgage filing.',
        documentHash: 'abcdef1234567890',
        latestStoragePath: '/docs/title.pdf',
        updatedAt: new Date('2026-03-25T00:00:00.000Z'),
        versions: [
          {
            versionNumber: 2,
            sourceLink: 'https://example.com/title',
            aiSummary: 'Current owner and mortgage filing.',
            documentHash: 'abcdef1234567890',
            storagePath: '/docs/title.pdf'
          }
        ]
      },
      {
        id: 'doc-2',
        title: 'Power Study',
        documentType: 'PERMIT',
        currentVersion: 1,
        sourceLink: null,
        aiSummary: 'Utility interconnection study with conditional sign-off.',
        documentHash: '1234567890abcdef',
        latestStoragePath: '/docs/power-study.pdf',
        updatedAt: new Date('2026-03-24T00:00:00.000Z'),
        versions: [
          {
            versionNumber: 1,
            sourceLink: null,
            aiSummary: 'Utility interconnection study with conditional sign-off.',
            documentHash: '1234567890abcdef',
            storagePath: '/docs/power-study.pdf'
          }
        ]
      },
      {
        id: 'doc-3',
        title: 'Anchor Lease Schedule',
        documentType: 'LEASE',
        sourceLink: null,
        currentVersion: 1,
        aiSummary: 'Lease roll and contracted revenue support package.',
        documentHash: 'feedfeed12345678',
        latestStoragePath: '/docs/lease.pdf',
        updatedAt: new Date('2026-03-23T00:00:00.000Z'),
        versions: [
          {
            versionNumber: 1,
            sourceLink: null,
            aiSummary: 'Lease roll and contracted revenue support package.',
            documentHash: 'feedfeed12345678',
            storagePath: '/docs/lease.pdf'
          }
        ]
      }
    ],
    valuations: [
      {
        id: 'run-1',
        runLabel: 'March DD Draft',
        createdAt: new Date('2026-03-26T00:00:00.000Z'),
        updatedAt: new Date('2026-03-26T00:00:00.000Z'),
        engineVersion: 'v2.7.0',
        confidenceScore: 68,
        baseCaseValueKrw: 138_000_000_000,
        underwritingMemo:
          'Refinancing pressure and legal cleanup create a special situation entry point. Cash flow remains viable if permit and rollover issues are resolved quickly.',
        keyRisks: ['Permit timing is still conditional.', 'Mortgage release mechanics need legal confirmation.'],
        ddChecklist: ['Confirm mortgage release path.', 'Refresh utility sign-off package.'],
        assumptions: {
          proForma: {
            baseCase: {
              summary: {
                annualRevenueKrw: 18_000_000_000,
                annualOpexKrw: 6_000_000_000,
                stabilizedNoiKrw: 12_000_000_000,
                terminalValueKrw: 160_000_000_000,
                terminalYear: 5,
                reserveRequirementKrw: 2_500_000_000,
                endingDebtBalanceKrw: 54_000_000_000,
                grossExitValueKrw: 160_000_000_000,
                netExitProceedsKrw: 151_000_000_000,
                leveredEquityValueKrw: 97_000_000_000
              },
              years: [
                {
                  year: 1,
                  totalOperatingRevenueKrw: 18_000_000_000,
                  noiKrw: 12_000_000_000,
                  debtServiceKrw: 10_500_000_000,
                  dscr: 1.14,
                  tenantCapitalCostKrw: 1_000_000_000,
                  nonRecoverableOperatingExpenseKrw: 1_200_000_000,
                  activeRenewalLeaseCount: 1
                }
              ]
            }
          }
        },
        provenance: [
          { field: 'powerPrice', sourceSystem: 'manual', value: 158, mode: 'manual', freshnessLabel: 'fresh' }
        ],
        scenarios: [
          { name: 'Bull', valuationKrw: 150_000_000_000, impliedYieldPct: 8.9, exitCapRatePct: 6.2, debtServiceCoverage: 1.28 },
          { name: 'Base', valuationKrw: 138_000_000_000, impliedYieldPct: 8.1, exitCapRatePct: 6.5, debtServiceCoverage: 1.14 },
          { name: 'Bear', valuationKrw: 121_000_000_000, impliedYieldPct: 7.5, exitCapRatePct: 6.9, debtServiceCoverage: 1.03 }
        ]
      }
    ],
    readinessProject: {
      onchainRecords: [
        {
          id: 'chain-1',
          documentId: 'doc-1',
          txHash: '0xabc123abc123abc123',
          chainId: '11155111',
          status: 'COMPLETED',
          anchoredAt: new Date('2026-03-26T00:00:00.000Z'),
          recordType: 'DOCUMENT_HASH'
        },
        {
          id: 'packet-1',
          documentId: null,
          txHash: null,
          chainId: null,
          status: 'READY',
          anchoredAt: new Date('2026-03-26T01:00:00.000Z'),
          recordType: 'REVIEW_PACKET',
          createdAt: new Date('2026-03-26T01:00:00.000Z'),
          payload: {
            packetFingerprint: 'packetfingerprint123456',
            latestValuationId: 'run-1',
            latestDocumentHash: 'abcdef1234567890',
            approvedEvidenceCount: 5,
            pendingEvidenceCount: 2
          }
        }
      ]
    }
  };
}

function makeOfficeAssetStub() {
  const now = new Date('2026-03-26T00:00:00.000Z');
  return {
    id: 'office-1',
    assetCode: 'SEOUL-YEOUIDO-01',
    slug: 'seoul-yeouido-01-core-office-tower',
    name: 'Yeouido Core Office Tower',
    assetClass: AssetClass.OFFICE,
    market: 'KR',
    status: 'UNDER_REVIEW',
    stage: 'STABILIZED',
    description: 'Prime Seoul office underwriting case.',
    ownerName: 'Han River Office Holdings',
    sponsorName: 'Nexus Seoul Capital',
    developmentSummary: 'Stabilized office tower with moderate rollover and refinance focus.',
    powerCapacityMw: null,
    grossFloorAreaSqm: 34100,
    rentableAreaSqm: 28500,
    updatedAt: now,
    address: { city: 'Seoul', province: 'Seoul', country: 'KR' },
    siteProfile: {},
    permitSnapshot: {
      powerApprovalStatus: 'N/A',
      reviewStatus: 'APPROVED',
      id: 'permit-office',
      reviewNotes: null,
      reviewedAt: now,
      reviewedById: 'user-1',
      sourceStatus: 'MANUAL',
      sourceUpdatedAt: now,
      updatedAt: now
    },
    energySnapshot: {
      tariffKrwPerKwh: 132,
      pueTarget: null,
      reviewStatus: 'APPROVED',
      id: 'energy-office',
      reviewNotes: null,
      reviewedAt: now,
      reviewedById: 'user-1',
      sourceStatus: 'MANUAL',
      sourceUpdatedAt: now,
      updatedAt: now
    },
    capexLineItems: [{ id: 'cap-1' }],
    leases: [{ id: 'lease-1', reviewStatus: 'APPROVED', reviewNotes: null, reviewedAt: now, reviewedById: 'user-1', updatedAt: now, tenantName: 'Anchor Tenant', status: 'ACTIVE', termYears: 5, notes: 'WALE support' }],
    debtFacilities: [{ id: 'debt-1' }],
    ownershipRecords: [{ id: 'own-1', reviewStatus: 'APPROVED', updatedAt: now, ownerName: 'Han River Office Holdings', entityType: 'SPV', ownershipPct: 100, reviewNotes: null, reviewedAt: now, reviewedById: 'user-1', sourceStatus: 'MANUAL', sourceUpdatedAt: now }],
    encumbranceRecords: [],
    planningConstraints: [],
    featureSnapshots: [],
    comparableSet: { entries: [{ id: 'comp-1' }, { id: 'comp-2' }, { id: 'comp-3' }] },
    officeDetail: {
      stabilizedRentPerSqmMonthKrw: 38500,
      weightedAverageLeaseTermYears: 4.4,
      tenantImprovementReserveKrw: 1200000000,
      leasingCommissionReserveKrw: 420000000
    },
    documents: [
      {
        id: 'doc-1',
        title: 'Office Rent Roll',
        documentType: 'LEASE',
        currentVersion: 1,
        sourceLink: null,
        aiSummary: 'WALE and rollover support.',
        documentHash: 'officehash123456',
        latestStoragePath: '/docs/office-rent-roll.pdf',
        updatedAt: now,
        versions: [
          {
            versionNumber: 1,
            sourceLink: null,
            aiSummary: 'WALE and rollover support.',
            documentHash: 'officehash123456',
            storagePath: '/docs/office-rent-roll.pdf'
          }
        ]
      }
    ],
    valuations: [
      {
        id: 'run-office-1',
        runLabel: 'Seeded office underwriting case',
        createdAt: now,
        updatedAt: now,
        engineVersion: 'kr-office-v1',
        confidenceScore: 72,
        baseCaseValueKrw: 318000000000,
        underwritingMemo: 'Office underwriting case built from approved leasing and legal evidence.',
        keyRisks: ['Near-term rollover requires leasing execution.'],
        ddChecklist: ['Refresh office rent comp set.'],
        assumptions: {},
        provenance: [],
        scenarios: [
          { name: 'Bull', valuationKrw: 340000000000, impliedYieldPct: 5, exitCapRatePct: 4.6, debtServiceCoverage: 1.32 },
          { name: 'Base', valuationKrw: 318000000000, impliedYieldPct: 4.8, exitCapRatePct: 4.9, debtServiceCoverage: 1.23 },
          { name: 'Bear', valuationKrw: 286000000000, impliedYieldPct: 4.4, exitCapRatePct: 5.3, debtServiceCoverage: 1.1 }
        ]
      }
    ],
    marketSnapshot: {
      capRatePct: 4.8,
      debtCostPct: 4.7,
      discountRatePct: 7.4,
      vacancyPct: 6.2,
      marketNotes: 'Prime Seoul office market remains disciplined.'
    },
    readinessProject: { onchainRecords: [] }
  };
}

test('report bundle and markdown export reuse valuation and document traceability data', async () => {
  const bundle = await buildReportBundleFromAsset(makeAssetStub() as never, {
    fxRateToKrw: 1,
    generatedAt: new Date('2026-03-26T00:00:00.000Z')
  });
  const report = buildDealReport(bundle, 'ic-memo');
  const markdown = serializeReportToMarkdown(report);

  assert.equal(report.title, 'IC Memo');
  assert.equal(report.audience, 'operator');
  assert.equal(bundle.documents[0]?.anchoredTxHash, '0xabc123abc123abc123');
  assert.ok(report.controlSheet.length >= 4);
  assert.match(report.versionLabel, /^IC-MEMO-20260326-/);
  assert.match(markdown, /## Document Schedule/);
  assert.match(markdown, /Traceability/);
  assert.match(markdown, /## Control Sheet/);
  assert.match(markdown, /Confirm mortgage release path\./);
  assert.ok(report.traceability.some((fact) => fact.label === 'Approved Evidence' && fact.value === '5'));
  assert.ok(report.traceability.some((fact) => fact.label === 'Research Freshness'));
  assert.ok(report.traceability.some((fact) => fact.label === 'House View' && fact.value.includes('approved')));
  assert.ok(report.controlSheet.some((fact) => fact.label === 'Research Coverage Queue'));
  assert.ok(report.controlSheet.some((fact) => fact.label === 'Review Packet Fingerprint'));
});

test('report template catalog exposes production-ready vs partial state', () => {
  const templates = listReportTemplates();
  assert.equal(templates.length, 4);
  assert.equal(templates.find((item) => item.kind === 'teaser')?.status, 'production-ready');
  assert.equal(templates.find((item) => item.kind === 'risk-memo')?.status, 'partial');
});

test('dd checklist and risk memo attach supporting document references', async () => {
  const bundle = await buildReportBundleFromAsset(makeAssetStub() as never, {
    fxRateToKrw: 1,
    generatedAt: new Date('2026-03-26T00:00:00.000Z')
  });
  const ddReport = buildDealReport(bundle, 'dd-checklist');
  const riskReport = buildDealReport(bundle, 'risk-memo');

  const ddSources = ddReport.sections.flatMap((section) => section.checklist?.flatMap((item) => item.sources ?? []) ?? []);
  const riskSources = riskReport.sections.flatMap((section) => section.checklist?.flatMap((item) => item.sources ?? []) ?? []);

  assert.ok(ddSources.some((source) => source.includes('Power Study')));
  assert.ok(riskSources.some((source) => source.includes('Title Extract')));
  assert.ok(ddSources.some((source) => source.includes('Anchor Lease Schedule')));
});

test('report packet bundle groups outputs by audience and serializes markdown', async () => {
  const bundle = await buildReportBundleFromAsset(makeAssetStub() as never, {
    fxRateToKrw: 1,
    generatedAt: new Date('2026-03-26T00:00:00.000Z')
  });

  const investorPacket = buildDealReportPacket(bundle, 'investor');
  const operatorPacket = buildDealReportPacket(bundle, 'operator');
  const markdown = serializeReportPacketToMarkdown(operatorPacket);

  assert.equal(investorPacket.reports.length, 1);
  assert.equal(investorPacket.reports[0]?.kind, 'teaser');
  assert.deepEqual(
    operatorPacket.reports.map((report) => report.kind),
    ['ic-memo', 'dd-checklist', 'risk-memo']
  );
  assert.match(markdown, /# IC Packet/);
  assert.match(markdown, /## Coverage And Gating Items/);
});

test('office report bundle uses office-native sizing and checklist copy', async () => {
  const bundle = await buildReportBundleFromAsset(makeOfficeAssetStub() as never, {
    fxRateToKrw: 1,
    generatedAt: new Date('2026-03-26T00:00:00.000Z')
  });
  const ddReport = buildDealReport(bundle, 'dd-checklist');

  assert.equal(bundle.assetClassLabel, 'Office');
  assert.equal(bundle.sizeLabel, 'Rentable Area');
  assert.ok(ddReport.sections.some((section) => section.title === 'Leasing, Rollover, And Market'));
});
