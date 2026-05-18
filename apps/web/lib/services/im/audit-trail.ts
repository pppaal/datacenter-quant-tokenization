/**
 * Audit-trail summary for the IM. Pulls recent AuditEvent rows tied
 * to the asset (or to the asset's valuation runs / counterparties)
 * so the committee can see who touched the underwriting most
 * recently and when.
 */
import type { PrismaClient } from '@prisma/client';

export type AuditEventRow = {
  id: string;
  actorIdentifier: string;
  actorRole: string;
  action: string;
  entityType: string;
  statusLabel: string;
  createdAt: Date;
};

export type AuditTrailSummary = {
  events: AuditEventRow[];
  totalCount: number;
  lastEventAt: Date | null;
  uniqueActors: string[];
  successCount: number;
  failureCount: number;
};

export async function buildAuditTrail(
  db: PrismaClient,
  options: {
    assetId: string;
    additionalEntityIds?: string[];
    limit?: number;
  }
): Promise<AuditTrailSummary> {
  const limit = options.limit ?? 12;
  const ids = [options.assetId, ...(options.additionalEntityIds ?? [])].filter(
    Boolean
  );
  const events = await db.auditEvent.findMany({
    where: {
      OR: [{ assetId: options.assetId }, { entityId: { in: ids } }]
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      actorIdentifier: true,
      actorRole: true,
      action: true,
      entityType: true,
      statusLabel: true,
      createdAt: true
    }
  });
  const totalCount = await db.auditEvent.count({
    where: { OR: [{ assetId: options.assetId }, { entityId: { in: ids } }] }
  });
  const uniqueActors = Array.from(new Set(events.map((e) => e.actorIdentifier)));
  const successCount = events.filter((e) =>
    /SUCCESS|OK/i.test(e.statusLabel)
  ).length;
  const failureCount = events.length - successCount;
  return {
    events,
    totalCount,
    lastEventAt: events[0]?.createdAt ?? null,
    uniqueActors,
    successCount,
    failureCount
  };
}
