import assert from 'node:assert/strict';
import test from 'node:test';
import { ReviewStatus } from '@prisma/client';
import {
  extractReviewPacketSummary,
  getLatestReviewPacketRecord,
  listPendingAssetReviewSummaries,
  reviewUnderwritingRecord
} from '@/lib/services/review';

test('reviewUnderwritingRecord persists reviewer metadata, notes, and re-promotes features', async () => {
  let promotedAssetId: string | null = null;
  const captured = {
    reviewData: null as {
      reviewedById: string | null;
      reviewStatus: 'APPROVED' | 'REJECTED';
      reviewNotes: string | null;
    } | null
  };

  const result = await reviewUnderwritingRecord(
    {
      recordType: 'energy_snapshot',
      recordId: 'energy_1',
      reviewStatus: 'APPROVED',
      reviewNotes: 'Utility tariff confirmed against latest invoice.',
      actor: {
        identifier: 'analyst@example.com',
        role: 'ANALYST',
        provider: 'oidc',
        email: 'analyst@example.com',
        subject: 'oidc-user-1'
      }
    },
    {
      user: {
        async findFirst() {
          return { id: 'user_analyst' };
        }
      },
      energySnapshot: {
        async update(args: any) {
          captured.reviewData = args.data;
          return {
            id: 'energy_1',
            assetId: 'asset_1',
            reviewStatus: args.data.reviewStatus,
            reviewNotes: args.data.reviewNotes
          };
        }
      },
      asset: {
        async findUnique() {
          return {
            id: 'asset_1',
            updatedAt: new Date('2026-03-22T00:00:00.000Z'),
            siteProfile: null,
            marketSnapshot: null,
            permitSnapshot: null,
            energySnapshot: {
              id: 'energy_1',
              reviewStatus: ReviewStatus.APPROVED,
              utilityName: 'KEPCO',
              updatedAt: new Date('2026-03-22T00:00:00.000Z'),
              reviewedById: 'user_analyst',
              reviewedAt: new Date('2026-03-22T00:00:00.000Z'),
              reviewNotes: 'Utility tariff confirmed against latest invoice.',
              sourceStatus: 'MANUAL',
              sourceUpdatedAt: new Date('2026-03-22T00:00:00.000Z')
            },
            ownershipRecords: [],
            encumbranceRecords: [],
            planningConstraints: [],
            leases: [],
            readinessProject: null
          };
        }
      },
      assetFeatureSnapshot: {
        async deleteMany() {
          return { count: 0 };
        },
        async create(args: any) {
          promotedAssetId = args.data.assetId;
          return { id: 'snapshot_1', assetId: args.data.assetId, values: args.data.values.create };
        }
      }
    } as any
  );

  const reviewedRecord = result as { reviewStatus: string; reviewNotes: string | null };
  if (!captured.reviewData) {
    throw new Error('Expected review update payload to be captured');
  }
  const reviewData = captured.reviewData;

  assert.equal(reviewedRecord.reviewStatus, 'APPROVED');
  assert.equal(reviewedRecord.reviewNotes, 'Utility tariff confirmed against latest invoice.');
  assert.equal(reviewData.reviewedById, 'user_analyst');
  assert.equal(reviewData.reviewStatus, 'APPROVED');
  assert.equal(promotedAssetId, 'asset_1');
});

test('listPendingAssetReviewSummaries returns pending evidence across asset classes grouped by discipline', async () => {
  const summaries = await listPendingAssetReviewSummaries({
    asset: {
      async findMany() {
        return [
          {
            id: 'asset_1',
            assetCode: 'SEOUL-YEOUIDO-01',
            name: 'Yeouido Core Office Tower',
            assetClass: 'OFFICE',
            energySnapshot: {
              id: 'energy_1',
              utilityName: 'KEPCO Seoul',
              tariffKrwPerKwh: 132,
              reviewStatus: ReviewStatus.PENDING,
              reviewNotes: null,
              reviewedAt: null,
              reviewedById: null,
              sourceStatus: 'MANUAL',
              sourceUpdatedAt: new Date('2026-03-22T00:00:00.000Z'),
              updatedAt: new Date('2026-03-22T00:00:00.000Z')
            },
            permitSnapshot: null,
            ownershipRecords: [],
            encumbranceRecords: [],
            planningConstraints: [],
            leases: [
              {
                id: 'lease_1',
                tenantName: 'Domestic Securities House',
                leasedKw: 0,
                baseRatePerKwKrw: 0,
                termYears: 5,
                status: 'ACTIVE',
                notes: 'Anchor office tenant',
                reviewStatus: ReviewStatus.PENDING,
                reviewNotes: null,
                reviewedAt: null,
                reviewedById: null,
                updatedAt: new Date('2026-03-22T01:00:00.000Z')
              }
            ]
          }
        ];
      }
    }
  } as any);

  assert.equal(summaries.length, 1);
  assert.equal(summaries[0]?.assetClassLabel, 'Office');
  assert.equal(summaries[0]?.pendingEvidenceCount, 2);
  assert.equal(
    summaries[0]?.disciplines.find((item) => item.key === 'power_permit')?.pendingCount,
    1
  );
  assert.ok(
    summaries[0]?.disciplines
      .find((item) => item.key === 'power_permit')
      ?.label.includes('Building')
  );
  assert.equal(
    summaries[0]?.disciplines.find((item) => item.key === 'lease_revenue')?.pendingCount,
    1
  );
});

test('review packet helpers pick the latest packet and normalize summary fields', () => {
  const latestRecord = getLatestReviewPacketRecord([
    {
      recordType: 'REVIEW_PACKET',
      createdAt: new Date('2026-03-21T00:00:00.000Z'),
      anchoredAt: null,
      txHash: null,
      payload: { packetFingerprint: 'old' }
    },
    {
      recordType: 'REVIEW_PACKET',
      createdAt: new Date('2026-03-22T00:00:00.000Z'),
      anchoredAt: new Date('2026-03-22T01:00:00.000Z'),
      txHash: '0xabc',
      payload: {
        packetFingerprint: 'newer',
        latestValuationId: 'run_1',
        latestDocumentHash: 'doc_hash',
        approvedEvidenceCount: 4,
        pendingEvidenceCount: 1
      }
    }
  ]);

  const summary = extractReviewPacketSummary(latestRecord);

  assert.equal(summary?.fingerprint, 'newer');
  assert.equal(summary?.latestValuationId, 'run_1');
  assert.equal(summary?.latestDocumentHash, 'doc_hash');
  assert.equal(summary?.approvedEvidenceCount, 4);
  assert.equal(summary?.pendingEvidenceCount, 1);
  assert.equal(summary?.anchorReference, '0xabc');
});
