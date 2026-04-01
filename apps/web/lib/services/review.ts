import crypto from 'node:crypto';
import { AssetClass, ReviewStatus, type PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { promoteAssetSnapshotsToFeatures } from '@/lib/services/feature-promotion';

export type ReviewDiscipline = 'power_permit' | 'legal_title' | 'lease_revenue';
export type ReviewableRecordType =
  | 'energy_snapshot'
  | 'permit_snapshot'
  | 'ownership_record'
  | 'encumbrance_record'
  | 'planning_constraint'
  | 'lease';

export type ReviewQueueItem = {
  recordType: ReviewableRecordType;
  recordId: string;
  assetId: string;
  assetCode: string;
  assetName: string;
  discipline: ReviewDiscipline;
  title: string;
  detail: string;
  reviewStatus: ReviewStatus;
  reviewNotes: string | null;
  reviewedAt: Date | null;
  reviewedById: string | null;
  sourceStatus: string | null;
  sourceUpdatedAt: Date | null;
  updatedAt: Date;
};

export type AssetEvidenceReviewSummary = {
  assetId: string;
  assetCode: string;
  assetName: string;
  totals: {
    approved: number;
    pending: number;
    rejected: number;
  };
  approvedCoverageCount: number;
  pendingEvidenceCount: number;
  rejectedEvidenceCount: number;
  pendingBlockers: string[];
  disciplines: Array<{
    key: ReviewDiscipline;
    label: string;
    approvedCount: number;
    pendingCount: number;
    rejectedCount: number;
    items: ReviewQueueItem[];
  }>;
};

export type ReviewPacketSummary = {
  fingerprint: string | null;
  stagedAt: Date | null;
  latestValuationId: string | null;
  latestDocumentHash: string | null;
  approvedEvidenceCount: number | null;
  pendingEvidenceCount: number | null;
  anchorReference: string | null;
};

type ReviewableAsset = {
  id: string;
  assetCode: string;
  name: string;
  energySnapshot?: any | null;
  permitSnapshot?: any | null;
  ownershipRecords?: any[];
  encumbranceRecords?: any[];
  planningConstraints?: any[];
  leases?: any[];
  featureSnapshots?: Array<{ id: string; featureNamespace: string; snapshotDate: Date; sourceVersion: string | null }>;
  documents?: Array<{
    id: string;
    currentVersion: number;
    title: string;
    documentHash: string | null;
    updatedAt: Date;
  }>;
  valuations?: Array<{
    id: string;
    runLabel: string;
    createdAt: Date;
  }>;
  readinessProject?: {
    onchainRecords?: Array<{
      txHash?: string | null;
      chainId?: string | null;
      status?: string | null;
      recordType?: string | null;
      anchoredAt?: Date | null;
      createdAt?: Date;
      payload?: unknown;
    }>;
  } | null;
};

const disciplineLabels: Record<ReviewDiscipline, string> = {
  power_permit: 'Power / Permit',
  legal_title: 'Legal / Title',
  lease_revenue: 'Lease / Revenue'
};

function createReviewItem(asset: ReviewableAsset, item: Omit<ReviewQueueItem, 'assetId' | 'assetCode' | 'assetName'>) {
  return {
    assetId: asset.id,
    assetCode: asset.assetCode,
    assetName: asset.name,
    ...item
  } satisfies ReviewQueueItem;
}

function sortReviewItems(items: ReviewQueueItem[]) {
  const rank = {
    [ReviewStatus.PENDING]: 0,
    [ReviewStatus.REJECTED]: 1,
    [ReviewStatus.APPROVED]: 2
  };

  return [...items].sort((left, right) => {
    return (
      rank[left.reviewStatus] - rank[right.reviewStatus] ||
      right.updatedAt.getTime() - left.updatedAt.getTime()
    );
  });
}

export function buildAssetEvidenceReviewSummary(asset: ReviewableAsset): AssetEvidenceReviewSummary {
  const items: ReviewQueueItem[] = [];

  if (asset.energySnapshot) {
    items.push(
      createReviewItem(asset, {
        recordType: 'energy_snapshot',
        recordId: asset.energySnapshot.id,
        discipline: 'power_permit',
        title: asset.energySnapshot.utilityName || 'Energy Snapshot',
        detail: [
          asset.energySnapshot.substationDistanceKm != null
            ? `${asset.energySnapshot.substationDistanceKm} km to substation`
            : null,
          asset.energySnapshot.tariffKrwPerKwh != null
            ? `tariff ${asset.energySnapshot.tariffKrwPerKwh} KRW/kWh`
            : null,
          asset.energySnapshot.pueTarget != null ? `PUE ${asset.energySnapshot.pueTarget}` : null
        ]
          .filter(Boolean)
          .join(' / ') || 'Utility, tariff, and resilience evidence',
        reviewStatus: asset.energySnapshot.reviewStatus,
        reviewNotes: asset.energySnapshot.reviewNotes ?? null,
        reviewedAt: asset.energySnapshot.reviewedAt ?? null,
        reviewedById: asset.energySnapshot.reviewedById ?? null,
        sourceStatus: asset.energySnapshot.sourceStatus ?? null,
        sourceUpdatedAt: asset.energySnapshot.sourceUpdatedAt ?? null,
        updatedAt: asset.energySnapshot.updatedAt
      })
    );
  }

  if (asset.permitSnapshot) {
    items.push(
      createReviewItem(asset, {
        recordType: 'permit_snapshot',
        recordId: asset.permitSnapshot.id,
        discipline: 'power_permit',
        title: asset.permitSnapshot.permitStage || 'Permit Snapshot',
        detail: [
          asset.permitSnapshot.powerApprovalStatus,
          asset.permitSnapshot.zoningApprovalStatus,
          asset.permitSnapshot.environmentalReviewStatus
        ]
          .filter(Boolean)
          .join(' / ') || 'Permit and approval evidence',
        reviewStatus: asset.permitSnapshot.reviewStatus,
        reviewNotes: asset.permitSnapshot.reviewNotes ?? null,
        reviewedAt: asset.permitSnapshot.reviewedAt ?? null,
        reviewedById: asset.permitSnapshot.reviewedById ?? null,
        sourceStatus: asset.permitSnapshot.sourceStatus ?? null,
        sourceUpdatedAt: asset.permitSnapshot.sourceUpdatedAt ?? null,
        updatedAt: asset.permitSnapshot.updatedAt
      })
    );
  }

  for (const record of asset.ownershipRecords ?? []) {
    items.push(
      createReviewItem(asset, {
        recordType: 'ownership_record',
        recordId: record.id,
        discipline: 'legal_title',
        title: record.ownerName || 'Ownership Record',
        detail: [record.entityType, record.ownershipPct != null ? `${record.ownershipPct}% ownership` : null]
          .filter(Boolean)
          .join(' / ') || 'Ownership chain evidence',
        reviewStatus: record.reviewStatus,
        reviewNotes: record.reviewNotes ?? null,
        reviewedAt: record.reviewedAt ?? null,
        reviewedById: record.reviewedById ?? null,
        sourceStatus: record.sourceStatus ?? null,
        sourceUpdatedAt: record.sourceUpdatedAt ?? null,
        updatedAt: record.updatedAt
      })
    );
  }

  for (const record of asset.encumbranceRecords ?? []) {
    items.push(
      createReviewItem(asset, {
        recordType: 'encumbrance_record',
        recordId: record.id,
        discipline: 'legal_title',
        title: record.encumbranceType || 'Encumbrance Record',
        detail: [
          record.holderName,
          record.securedAmountKrw != null ? `${record.securedAmountKrw} KRW secured` : null,
          record.statusLabel
        ]
          .filter(Boolean)
          .join(' / ') || 'Lien and mortgage evidence',
        reviewStatus: record.reviewStatus,
        reviewNotes: record.reviewNotes ?? null,
        reviewedAt: record.reviewedAt ?? null,
        reviewedById: record.reviewedById ?? null,
        sourceStatus: record.sourceStatus ?? null,
        sourceUpdatedAt: record.sourceUpdatedAt ?? null,
        updatedAt: record.updatedAt
      })
    );
  }

  for (const record of asset.planningConstraints ?? []) {
    items.push(
      createReviewItem(asset, {
        recordType: 'planning_constraint',
        recordId: record.id,
        discipline: 'legal_title',
        title: record.title || record.constraintType || 'Planning Constraint',
        detail: [record.constraintType, record.severity, record.description].filter(Boolean).join(' / ') || 'Planning restriction evidence',
        reviewStatus: record.reviewStatus,
        reviewNotes: record.reviewNotes ?? null,
        reviewedAt: record.reviewedAt ?? null,
        reviewedById: record.reviewedById ?? null,
        sourceStatus: record.sourceStatus ?? null,
        sourceUpdatedAt: record.sourceUpdatedAt ?? null,
        updatedAt: record.updatedAt
      })
    );
  }

  for (const record of asset.leases ?? []) {
    items.push(
      createReviewItem(asset, {
        recordType: 'lease',
        recordId: record.id,
        discipline: 'lease_revenue',
        title: record.tenantName || 'Lease',
        detail: [
          record.status,
          record.leasedKw != null ? `${record.leasedKw} kW` : null,
          record.baseRatePerKwKrw != null ? `${record.baseRatePerKwKrw} KRW/kW` : null,
          record.termYears != null ? `${record.termYears} year term` : null
        ]
          .filter(Boolean)
          .join(' / ') || 'Revenue and tenant evidence',
        reviewStatus: record.reviewStatus,
        reviewNotes: record.reviewNotes ?? null,
        reviewedAt: record.reviewedAt ?? null,
        reviewedById: record.reviewedById ?? null,
        sourceStatus: 'MANUAL',
        sourceUpdatedAt: null,
        updatedAt: record.updatedAt
      })
    );
  }

  const disciplines = (['power_permit', 'legal_title', 'lease_revenue'] as const).map((key) => {
    const disciplineItems = sortReviewItems(items.filter((item) => item.discipline === key));
    return {
      key,
      label: disciplineLabels[key],
      approvedCount: disciplineItems.filter((item) => item.reviewStatus === ReviewStatus.APPROVED).length,
      pendingCount: disciplineItems.filter((item) => item.reviewStatus === ReviewStatus.PENDING).length,
      rejectedCount: disciplineItems.filter((item) => item.reviewStatus === ReviewStatus.REJECTED).length,
      items: disciplineItems
    };
  });

  const approvedCoverageCount = disciplines.filter((discipline) => discipline.approvedCount > 0).length;
  const pendingBlockers = items
    .filter((item) => item.reviewStatus === ReviewStatus.PENDING)
    .map((item) => `${disciplineLabels[item.discipline]}: ${item.title}`);

  return {
    assetId: asset.id,
    assetCode: asset.assetCode,
    assetName: asset.name,
    totals: {
      approved: items.filter((item) => item.reviewStatus === ReviewStatus.APPROVED).length,
      pending: items.filter((item) => item.reviewStatus === ReviewStatus.PENDING).length,
      rejected: items.filter((item) => item.reviewStatus === ReviewStatus.REJECTED).length
    },
    approvedCoverageCount,
    pendingEvidenceCount: items.filter((item) => item.reviewStatus === ReviewStatus.PENDING).length,
    rejectedEvidenceCount: items.filter((item) => item.reviewStatus === ReviewStatus.REJECTED).length,
    pendingBlockers,
    disciplines
  };
}

export async function listPendingAssetReviewSummaries(db: PrismaClient = prisma) {
  const assets = await db.asset.findMany({
    where: {
      assetClass: AssetClass.DATA_CENTER,
      OR: [
        { energySnapshot: { is: { reviewStatus: ReviewStatus.PENDING } } },
        { permitSnapshot: { is: { reviewStatus: ReviewStatus.PENDING } } },
        { ownershipRecords: { some: { reviewStatus: ReviewStatus.PENDING } } },
        { encumbranceRecords: { some: { reviewStatus: ReviewStatus.PENDING } } },
        { planningConstraints: { some: { reviewStatus: ReviewStatus.PENDING } } },
        { leases: { some: { reviewStatus: ReviewStatus.PENDING } } }
      ]
    },
    include: {
      energySnapshot: true,
      permitSnapshot: true,
      ownershipRecords: {
        orderBy: {
          updatedAt: 'desc'
        }
      },
      encumbranceRecords: {
        orderBy: {
          updatedAt: 'desc'
        }
      },
      planningConstraints: {
        orderBy: {
          updatedAt: 'desc'
        }
      },
      leases: {
        orderBy: {
          updatedAt: 'desc'
        }
      }
    },
    orderBy: {
      updatedAt: 'desc'
    }
  });

  return assets
    .map((asset) => buildAssetEvidenceReviewSummary(asset as unknown as ReviewableAsset))
    .filter((summary) => summary.pendingEvidenceCount > 0)
    .sort((left, right) => {
      return (
        right.pendingEvidenceCount - left.pendingEvidenceCount ||
        right.pendingBlockers.length - left.pendingBlockers.length ||
        left.assetCode.localeCompare(right.assetCode)
      );
    });
}

async function resolveReviewerUserId(actorIdentifier: string | null | undefined, db: PrismaClient) {
  if (!actorIdentifier) return null;
  const user = await db.user.findFirst({
    where: {
      OR: [{ email: actorIdentifier }, { name: actorIdentifier }]
    },
    select: {
      id: true
    }
  });

  return user?.id ?? null;
}

export async function reviewUnderwritingRecord(
  input: {
    recordType: ReviewableRecordType;
    recordId: string;
    reviewStatus: 'APPROVED' | 'REJECTED';
    reviewNotes?: string | null;
    actorIdentifier?: string | null;
  },
  db: PrismaClient = prisma
) {
  const reviewedById = await resolveReviewerUserId(input.actorIdentifier, db);
  const reviewData = {
    reviewStatus: input.reviewStatus,
    reviewNotes: input.reviewNotes?.trim() || null,
    reviewedAt: new Date(),
    reviewedById
  };

  let assetId: string | null = null;
  let result: unknown = null;

  switch (input.recordType) {
    case 'energy_snapshot': {
      const record = await db.energySnapshot.update({
        where: { id: input.recordId },
        data: reviewData,
        select: { id: true, assetId: true, reviewStatus: true, reviewNotes: true }
      });
      assetId = record.assetId;
      result = record;
      break;
    }
    case 'permit_snapshot': {
      const record = await db.permitSnapshot.update({
        where: { id: input.recordId },
        data: reviewData,
        select: { id: true, assetId: true, reviewStatus: true, reviewNotes: true }
      });
      assetId = record.assetId;
      result = record;
      break;
    }
    case 'ownership_record': {
      const record = await db.ownershipRecord.update({
        where: { id: input.recordId },
        data: reviewData,
        select: { id: true, assetId: true, reviewStatus: true, reviewNotes: true }
      });
      assetId = record.assetId;
      result = record;
      break;
    }
    case 'encumbrance_record': {
      const record = await db.encumbranceRecord.update({
        where: { id: input.recordId },
        data: reviewData,
        select: { id: true, assetId: true, reviewStatus: true, reviewNotes: true }
      });
      assetId = record.assetId;
      result = record;
      break;
    }
    case 'planning_constraint': {
      const record = await db.planningConstraint.update({
        where: { id: input.recordId },
        data: reviewData,
        select: { id: true, assetId: true, reviewStatus: true, reviewNotes: true }
      });
      assetId = record.assetId;
      result = record;
      break;
    }
    case 'lease': {
      const record = await db.lease.update({
        where: { id: input.recordId },
        data: reviewData,
        select: { id: true, assetId: true, reviewStatus: true, reviewNotes: true }
      });
      assetId = record.assetId;
      result = record;
      break;
    }
  }

  if (assetId) {
    await promoteAssetSnapshotsToFeatures(assetId, db);
  }

  return result;
}

export function getLatestReviewPacketRecord(
  records:
    | Array<{
        txHash?: string | null;
        chainId?: string | null;
        status?: string | null;
        recordType?: string | null;
        anchoredAt?: Date | null;
        createdAt?: Date;
        payload?: unknown;
      }>
    | null
    | undefined
) {
  return [...(records ?? [])]
    .filter((record) => record.recordType === 'REVIEW_PACKET')
    .sort((left, right) => {
      const leftTimestamp = (left.anchoredAt ?? left.createdAt ?? new Date(0)).getTime();
      const rightTimestamp = (right.anchoredAt ?? right.createdAt ?? new Date(0)).getTime();
      return rightTimestamp - leftTimestamp;
    })[0] ?? null;
}

export function extractReviewPacketSummary(
  record:
    | {
        txHash?: string | null;
        anchoredAt?: Date | null;
        createdAt?: Date;
        payload?: unknown;
      }
    | null
    | undefined
): ReviewPacketSummary | null {
  if (!record || !record.payload || typeof record.payload !== 'object') return null;

  const payload = record.payload as Record<string, unknown>;

  return {
    fingerprint: typeof payload.packetFingerprint === 'string' ? payload.packetFingerprint : null,
    stagedAt: record.anchoredAt ?? record.createdAt ?? null,
    latestValuationId: typeof payload.latestValuationId === 'string' ? payload.latestValuationId : null,
    latestDocumentHash: typeof payload.latestDocumentHash === 'string' ? payload.latestDocumentHash : null,
    approvedEvidenceCount: typeof payload.approvedEvidenceCount === 'number' ? payload.approvedEvidenceCount : null,
    pendingEvidenceCount: typeof payload.pendingEvidenceCount === 'number' ? payload.pendingEvidenceCount : null,
    anchorReference: record.txHash ?? null
  };
}

function normalizePacketValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((entry) => normalizePacketValue(entry));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, normalizePacketValue(entry)])
    );
  }

  return value;
}

export function buildReviewPacketManifest(asset: ReviewableAsset) {
  const reviewSummary = buildAssetEvidenceReviewSummary(asset);
  const latestValuation = asset.valuations?.[0] ?? null;
  const documents = [...(asset.documents ?? [])]
    .map((document) => ({
      id: document.id,
      title: document.title,
      version: document.currentVersion,
      hash: document.documentHash,
      updatedAt: document.updatedAt.toISOString()
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  const approvedEvidence = reviewSummary.disciplines
    .flatMap((discipline) => discipline.items)
    .filter((item) => item.reviewStatus === ReviewStatus.APPROVED)
    .map((item) => ({
      recordType: item.recordType,
      recordId: item.recordId,
      discipline: item.discipline,
      reviewedAt: item.reviewedAt?.toISOString() ?? null,
      reviewedById: item.reviewedById
    }))
    .sort((left, right) => `${left.recordType}:${left.recordId}`.localeCompare(`${right.recordType}:${right.recordId}`));
  const promotedFeatureSnapshots = [...(asset.featureSnapshots ?? [])]
    .map((snapshot) => ({
      id: snapshot.id,
      namespace: snapshot.featureNamespace,
      snapshotDate: snapshot.snapshotDate.toISOString(),
      sourceVersion: snapshot.sourceVersion
    }))
    .sort((left, right) => left.namespace.localeCompare(right.namespace));

  const manifest = normalizePacketValue({
    assetId: asset.id,
    assetCode: asset.assetCode,
    approvedEvidenceCount: reviewSummary.totals.approved,
    pendingEvidenceCount: reviewSummary.totals.pending,
    rejectedEvidenceCount: reviewSummary.totals.rejected,
    latestValuation: latestValuation
      ? {
          id: latestValuation.id,
          runLabel: latestValuation.runLabel,
          createdAt: latestValuation.createdAt.toISOString()
        }
      : null,
    documents,
    approvedEvidence,
    promotedFeatureSnapshots
  });

  const fingerprint = crypto
    .createHash('sha256')
    .update(JSON.stringify(manifest))
    .digest('hex');

  return {
    manifest,
    fingerprint,
    reviewSummary
  };
}
