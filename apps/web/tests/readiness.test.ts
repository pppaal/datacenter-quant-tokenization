import assert from 'node:assert/strict';
import test from 'node:test';
import { stageReviewReadiness } from '@/lib/services/readiness';

test('stageReviewReadiness stores deterministic review packet metadata offchain', async () => {
  const createdRecords: any[] = [];
  const updates: any[] = [];

  const assetContext = {
    id: 'asset_1',
    assetCode: 'KR-DC-001',
    name: 'Seoul Data Campus',
    updatedAt: new Date('2026-04-01T00:00:00.000Z'),
    energySnapshot: {
      id: 'energy_1',
      utilityName: 'KEPCO',
      substationDistanceKm: 1.2,
      tariffKrwPerKwh: 158,
      pueTarget: 1.28,
      backupFuelHours: 48,
      renewableAvailabilityPct: 20,
      reviewStatus: 'APPROVED',
      reviewNotes: null,
      reviewedAt: new Date('2026-03-31T00:00:00.000Z'),
      reviewedById: 'user_power',
      sourceStatus: 'MANUAL',
      sourceUpdatedAt: new Date('2026-03-31T00:00:00.000Z'),
      updatedAt: new Date('2026-03-31T00:00:00.000Z')
    },
    permitSnapshot: {
      id: 'permit_1',
      permitStage: 'Power allocation review',
      powerApprovalStatus: 'Conditional',
      zoningApprovalStatus: 'Approved',
      environmentalReviewStatus: 'Approved',
      timelineNotes: 'Awaiting final slot confirmation',
      reviewStatus: 'APPROVED',
      reviewNotes: null,
      reviewedAt: new Date('2026-03-31T00:00:00.000Z'),
      reviewedById: 'user_permit',
      sourceStatus: 'MANUAL',
      sourceUpdatedAt: new Date('2026-03-31T00:00:00.000Z'),
      updatedAt: new Date('2026-03-31T00:00:00.000Z')
    },
    ownershipRecords: [],
    encumbranceRecords: [],
    planningConstraints: [],
    leases: [
      {
        id: 'lease_1',
        tenantName: 'Anchor Cloud',
        status: 'SIGNED',
        leasedKw: 12000,
        baseRatePerKwKrw: 215000,
        termYears: 10,
        probabilityPct: 80,
        annualEscalationPct: 2.5,
        reviewStatus: 'APPROVED',
        reviewNotes: null,
        reviewedAt: new Date('2026-03-31T00:00:00.000Z'),
        reviewedById: 'user_lease',
        updatedAt: new Date('2026-03-31T00:00:00.000Z')
      }
    ],
    featureSnapshots: [],
    valuations: [
      {
        id: 'run_1',
        runLabel: 'IC Ready',
        createdAt: new Date('2026-04-01T00:00:00.000Z')
      }
    ],
    documents: [
      {
        id: 'doc_1',
        title: 'Korea Title Pack',
        currentVersion: 3,
        documentHash: 'abcdef1234567890',
        updatedAt: new Date('2026-04-01T00:00:00.000Z')
      }
    ],
    readinessProject: {
      id: 'readiness_1',
      onchainRecords: []
    },
    siteProfile: null,
    marketSnapshot: null
  };

  const db = {
    asset: {
      async findUnique() {
        return assetContext;
      }
    },
    assetFeatureSnapshot: {
      async deleteMany() {
        return { count: 0 };
      },
      async create(args: any) {
        return {
          id: `${args.data.featureNamespace}_snapshot`,
          assetId: args.data.assetId,
          values: args.data.values.create
        };
      }
    },
    onchainRecord: {
      async findFirst() {
        return null;
      },
      async create(args: any) {
        createdRecords.push(args.data);
        return {
          id: `${args.data.recordType}_${createdRecords.length}`,
          createdAt: new Date('2026-04-01T00:00:00.000Z'),
          ...args.data
        };
      },
      async update(args: any) {
        createdRecords.push(args.data);
        return {
          id: args.where.id,
          createdAt: new Date('2026-04-01T00:00:00.000Z'),
          ...args.data
        };
      }
    },
    readinessProject: {
      async update(args: any) {
        updates.push(args);
        return {
          id: 'readiness_1',
          onchainRecords: createdRecords
        };
      }
    }
  } as any;

  await stageReviewReadiness('asset_1', db);

  const reviewPacket = createdRecords.find((record) => record.recordType === 'REVIEW_PACKET');
  const documentHashRecord = createdRecords.find((record) => record.recordType === 'DOCUMENT_HASH');

  assert.ok(reviewPacket);
  assert.equal(reviewPacket.payload.assetCode, 'KR-DC-001');
  assert.equal(reviewPacket.payload.latestValuationId, 'run_1');
  assert.equal(reviewPacket.payload.latestDocumentHash, 'abcdef1234567890');
  assert.ok(typeof reviewPacket.payload.packetFingerprint === 'string');
  assert.equal(reviewPacket.payload.approvedEvidenceCount, 3);
  assert.equal(reviewPacket.payload.pendingEvidenceCount, 0);
  assert.equal(documentHashRecord.payload.packetFingerprint, reviewPacket.payload.packetFingerprint);
  assert.equal(updates.at(-1)?.data.readinessStatus, 'READY');
});
