import assert from 'node:assert/strict';
import test from 'node:test';
import { anchorLatestDocumentOnchain, registerAssetOnchain, stageReviewReadiness } from '@/lib/services/readiness';

function buildReadinessAssetContext() {
  return {
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
        documentHash: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        updatedAt: new Date('2026-04-01T00:00:00.000Z')
      }
    ],
    readinessProject: {
      id: 'readiness_1',
      onchainRecords: [] as any[]
    },
    siteProfile: null,
    marketSnapshot: null
  };
}

function buildReadinessDb(assetContext: ReturnType<typeof buildReadinessAssetContext>) {
  const createdRecords: any[] = [];
  const updates: any[] = [];

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
      async findFirst(args: any) {
        return createdRecords
          .filter((record) => {
            if (args.where?.recordType && record.recordType !== args.where.recordType) return false;
            if ('documentId' in (args.where ?? {}) && record.documentId !== args.where.documentId) return false;
            return true;
          })
          .at(-1) ?? null;
      },
      async create(args: any) {
        createdRecords.push(args.data);
        assetContext.readinessProject.onchainRecords.push({
          id: `${args.data.recordType}_${createdRecords.length}`,
          createdAt: new Date('2026-04-01T00:00:00.000Z'),
          ...args.data
        });
        return assetContext.readinessProject.onchainRecords.at(-1);
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
        assetContext.readinessProject = {
          ...assetContext.readinessProject,
          ...args.data,
          onchainRecords: assetContext.readinessProject.onchainRecords
        };
        return {
          id: 'readiness_1',
          onchainRecords: assetContext.readinessProject.onchainRecords,
          ...args.data
        };
      }
    }
  } as any;

  return { db, createdRecords, updates };
}

test('stageReviewReadiness stores deterministic review packet metadata offchain', async () => {
  const assetContext = buildReadinessAssetContext();
  const { db, createdRecords, updates } = buildReadinessDb(assetContext);

  await stageReviewReadiness('asset_1', db);

  const reviewPacket = createdRecords.find((record) => record.recordType === 'REVIEW_PACKET');
  const documentHashRecord = createdRecords.find((record) => record.recordType === 'DOCUMENT_HASH');

  assert.ok(reviewPacket);
  assert.equal(reviewPacket.payload.assetCode, 'KR-DC-001');
  assert.equal(reviewPacket.payload.latestValuationId, 'run_1');
  assert.equal(
    reviewPacket.payload.latestDocumentHash,
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
  );
  assert.ok(typeof reviewPacket.payload.packetFingerprint === 'string');
  assert.equal(reviewPacket.payload.approvedEvidenceCount, 3);
  assert.equal(reviewPacket.payload.pendingEvidenceCount, 0);
  assert.equal(documentHashRecord.payload.packetFingerprint, reviewPacket.payload.packetFingerprint);
  assert.equal(updates.at(-1)?.data.readinessStatus, 'READY');
});

test('mock blockchain mode supports register and anchor flows for deterministic E2E', async () => {
  process.env.BLOCKCHAIN_MOCK_MODE = 'true';
  const assetContext = buildReadinessAssetContext();
  const { db } = buildReadinessDb(assetContext);

  const registerResult = await registerAssetOnchain('asset_1', db);
  assert.equal(registerResult.chainName, 'mock-registry');
  assert.match(registerResult.txHash ?? '', /^0x[a-f0-9]{64}$/i);

  const anchorResult = await anchorLatestDocumentOnchain('asset_1', db);
  assert.equal(anchorResult.chainName, 'mock-registry');
  assert.equal(anchorResult.alreadyAnchored, false);
  assert.match(anchorResult.txHash ?? '', /^0x[a-f0-9]{64}$/i);

  delete process.env.BLOCKCHAIN_MOCK_MODE;
});
