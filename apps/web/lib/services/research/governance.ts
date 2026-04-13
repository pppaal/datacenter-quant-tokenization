import type { PrismaClient } from '@prisma/client';
import {
  NotificationSeverity,
  NotificationType,
  createNotification
} from '@/lib/services/notifications';

type GovernanceDb = Pick<PrismaClient, 'researchSnapshot' | '$transaction'>;

type SnapshotRecord = {
  id: string;
  snapshotKey: string;
  assetId: string | null;
  marketUniverseId: string | null;
  submarketId: string | null;
  snapshotType: string;
  viewType: 'SOURCE' | 'HOUSE';
  approvalStatus: 'DRAFT' | 'APPROVED' | 'SUPERSEDED';
  title: string;
  summary: string | null;
  snapshotDate: Date;
  sourceSystem: string | null;
  freshnessStatus: string | null;
  freshnessLabel: string | null;
  metrics: unknown;
  provenance: unknown;
};

type Approver = {
  userId: string | null;
  identifier: string;
};

function isHouseSnapshot(snapshot: SnapshotRecord) {
  return snapshot.viewType === 'HOUSE';
}

export async function approveResearchHouseViewSnapshot(
  snapshotId: string,
  approver: Approver,
  db: GovernanceDb
) {
  const snapshot = await db.researchSnapshot.findUnique({
    where: { id: snapshotId },
    select: {
      id: true,
      snapshotKey: true,
      assetId: true,
      marketUniverseId: true,
      submarketId: true,
      snapshotType: true,
      viewType: true,
      approvalStatus: true,
      title: true,
      summary: true,
      snapshotDate: true,
      sourceSystem: true,
      freshnessStatus: true,
      freshnessLabel: true,
      metrics: true,
      provenance: true
    }
  });

  if (!snapshot) {
    throw new Error('Research snapshot not found.');
  }

  if (!isHouseSnapshot(snapshot as SnapshotRecord)) {
    throw new Error('Only house-view research snapshots can be approved.');
  }

  if ((snapshot as SnapshotRecord).approvalStatus === 'APPROVED') {
    throw new Error('Snapshot is already approved. Create a new draft to supersede.');
  }

  const previousApproved = await db.researchSnapshot.findFirst({
    where: {
      id: {
        not: snapshot.id
      },
      assetId: snapshot.assetId ?? null,
      marketUniverseId: snapshot.marketUniverseId ?? null,
      submarketId: snapshot.submarketId ?? null,
      snapshotType: snapshot.snapshotType,
      viewType: 'HOUSE',
      approvalStatus: 'APPROVED'
    },
    orderBy: [
      {
        approvedAt: 'desc'
      },
      {
        createdAt: 'desc'
      }
    ],
    select: {
      id: true
    }
  });

  const approvedSnapshot = await db.$transaction(async (tx) => {
    if (previousApproved) {
      await tx.researchSnapshot.update({
        where: { id: previousApproved.id },
        data: {
          approvalStatus: 'SUPERSEDED'
        }
      });
    }

    const approvedAt = new Date();
    const lineagePayload =
      snapshot.provenance && typeof snapshot.provenance === 'object'
        ? {
            ...(snapshot.provenance as Record<string, unknown>),
            approvedByIdentifier: approver.identifier,
            approvedAt: approvedAt.toISOString(),
            approvedFromSnapshotId: snapshot.id,
            supersedesSnapshotId: previousApproved?.id ?? null
          }
        : {
            approvedByIdentifier: approver.identifier,
            approvedAt: approvedAt.toISOString(),
            approvedFromSnapshotId: snapshot.id,
            supersedesSnapshotId: previousApproved?.id ?? null
          };

    const approvedSnapshot = await tx.researchSnapshot.create({
      data: {
        snapshotKey: `${snapshot.snapshotKey}:approved:${approvedAt.getTime()}`,
        assetId: snapshot.assetId,
        marketUniverseId: snapshot.marketUniverseId,
        submarketId: snapshot.submarketId,
        snapshotType: snapshot.snapshotType,
        viewType: 'HOUSE',
        approvalStatus: 'APPROVED',
        title: snapshot.title,
        summary: snapshot.summary,
        snapshotDate: snapshot.snapshotDate,
        sourceSystem: snapshot.sourceSystem,
        freshnessStatus: snapshot.freshnessStatus,
        freshnessLabel: snapshot.freshnessLabel,
        approvedAt,
        approvedById: approver.userId,
        supersedesSnapshotId: previousApproved?.id ?? null,
        metrics: snapshot.metrics as never,
        provenance: lineagePayload as never
      }
    });

    await tx.researchSnapshot.update({
      where: { id: snapshot.id },
      data: {
        approvalStatus: 'DRAFT',
        approvedAt: null,
        approvedById: null
      }
    });

    return approvedSnapshot;
  });

  try {
    await createNotification({
      type: NotificationType.RESEARCH_APPROVED,
      severity: NotificationSeverity.INFO,
      title: `Research house view approved: ${snapshot.title}`,
      body: `${approver.identifier} approved ${snapshot.snapshotType} snapshot.`,
      entityType: 'ResearchSnapshot',
      entityId: approvedSnapshot.id
    });
  } catch (error) {
    console.error('Failed to create RESEARCH_APPROVED notification', error);
  }

  return approvedSnapshot;
}
