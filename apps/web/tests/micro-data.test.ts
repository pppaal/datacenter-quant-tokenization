import assert from 'node:assert/strict';
import test from 'node:test';
import { LeaseStatus, ReviewStatus, SourceStatus } from '@prisma/client';
import { updateAssetMicroData } from '@/lib/services/micro-data';

test('micro data update upserts energy and permit snapshots and creates a primary lease', async () => {
  let capturedUpdate: any;
  let promotedAssetId: string | null = null;

  const result = await updateAssetMicroData(
    'asset_1',
    {
      utilityName: 'KEPCO',
      substationDistanceKm: 1.4,
      powerApprovalStatus: 'Committee slot pending',
      permitStage: 'Power allocation review',
      tenantName: 'Anchor Cloud Co.',
      leaseStatus: LeaseStatus.SIGNED,
      leasedKw: 12000,
      termYears: 10,
      baseRatePerKwKrw: 220000
    },
    {
      db: {
        asset: {
          async findUnique() {
            return {
              id: 'asset_1',
              assetClass: 'DATA_CENTER',
              powerCapacityMw: 24,
              targetItLoadMw: 18,
              energySnapshot: null,
              permitSnapshot: null,
              ownershipRecords: [],
              encumbranceRecords: [],
              planningConstraints: [],
              leases: []
            };
          },
          async update(args: any) {
            capturedUpdate = args;
            return { id: 'asset_1' };
          }
        }
      } as any,
      promoter: async (assetId) => {
        promotedAssetId = assetId;
        return [];
      }
    }
  );

  assert.equal(result.id, 'asset_1');
  assert.equal(capturedUpdate.data.energySnapshot.upsert.create.utilityName, 'KEPCO');
  assert.equal(capturedUpdate.data.energySnapshot.upsert.create.sourceStatus, SourceStatus.MANUAL);
  assert.equal(capturedUpdate.data.energySnapshot.upsert.create.reviewStatus, ReviewStatus.PENDING);
  assert.equal(
    capturedUpdate.data.permitSnapshot.upsert.create.permitStage,
    'Power allocation review'
  );
  assert.equal(capturedUpdate.data.permitSnapshot.upsert.create.reviewStatus, ReviewStatus.PENDING);
  assert.equal(capturedUpdate.data.leases.create.tenantName, 'Anchor Cloud Co.');
  assert.equal(capturedUpdate.data.leases.create.status, LeaseStatus.SIGNED);
  assert.equal(capturedUpdate.data.leases.create.reviewStatus, ReviewStatus.PENDING);
  assert.equal(promotedAssetId, 'asset_1');
});

test('micro data update creates legal ownership, encumbrance, and planning records', async () => {
  let capturedUpdate: any;

  await updateAssetMicroData(
    'asset_legal',
    {
      legalOwnerName: 'Seoul Infra SPV',
      legalOwnerEntityType: 'SPV',
      ownershipPct: 100,
      encumbranceType: 'Senior mortgage',
      encumbranceHolderName: 'Korea Infrastructure Bank',
      securedAmountKrw: 42000000000,
      priorityRank: 1,
      encumbranceStatus: 'Active',
      planningConstraintType: 'Access easement',
      planningConstraintTitle: 'Shared ingress corridor',
      planningConstraintSeverity: 'Medium',
      planningConstraintDescription:
        'Road widening coordination remains open with the local authority.'
    },
    {
      db: {
        asset: {
          async findUnique() {
            return {
              id: 'asset_legal',
              assetClass: 'DATA_CENTER',
              powerCapacityMw: 30,
              targetItLoadMw: 24,
              energySnapshot: null,
              permitSnapshot: null,
              ownershipRecords: [],
              encumbranceRecords: [],
              planningConstraints: [],
              leases: []
            };
          },
          async update(args: any) {
            capturedUpdate = args;
            return { id: 'asset_legal' };
          }
        }
      } as any,
      promoter: async () => []
    }
  );

  assert.equal(capturedUpdate.data.ownerName, 'Seoul Infra SPV');
  assert.equal(capturedUpdate.data.ownershipRecords.create.ownerName, 'Seoul Infra SPV');
  assert.equal(capturedUpdate.data.ownershipRecords.create.reviewStatus, ReviewStatus.PENDING);
  assert.equal(capturedUpdate.data.encumbranceRecords.create.encumbranceType, 'Senior mortgage');
  assert.equal(capturedUpdate.data.encumbranceRecords.create.reviewStatus, ReviewStatus.PENDING);
  assert.equal(capturedUpdate.data.planningConstraints.create.title, 'Shared ingress corridor');
  assert.equal(capturedUpdate.data.planningConstraints.create.reviewStatus, ReviewStatus.PENDING);
});

test('micro data update normalizes non-KRW money inputs using the asset market currency', async () => {
  let capturedUpdate: any;

  await updateAssetMicroData(
    'asset_us',
    {
      inputCurrency: 'USD',
      tariffKrwPerKwh: 0.12,
      tenantName: 'US Cloud Co.',
      leasedKw: 8000,
      termYears: 7,
      baseRatePerKwKrw: 150,
      fitOutCostKrw: 250000,
      encumbranceType: 'Senior mortgage',
      securedAmountKrw: 5000000
    },
    {
      db: {
        asset: {
          async findUnique() {
            return {
              id: 'asset_us',
              assetClass: 'DATA_CENTER',
              market: 'US',
              address: { country: 'US' },
              powerCapacityMw: 16,
              targetItLoadMw: 12,
              energySnapshot: null,
              permitSnapshot: null,
              ownershipRecords: [],
              encumbranceRecords: [],
              planningConstraints: [],
              leases: []
            };
          },
          async update(args: any) {
            capturedUpdate = args;
            return { id: 'asset_us' };
          }
        }
      } as any,
      promoter: async () => []
    }
  );

  assert.equal(capturedUpdate.data.energySnapshot.upsert.create.tariffKrwPerKwh, 162);
  assert.equal(capturedUpdate.data.leases.create.baseRatePerKwKrw, 202500);
  assert.equal(capturedUpdate.data.leases.create.fitOutCostKrw, 337500000);
});
