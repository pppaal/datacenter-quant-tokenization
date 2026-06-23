import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';

export type AuditEventFilters = {
  actor?: string;
  entityType?: string;
  entityId?: string;
  severity?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  cursor?: string;
};

export type AuditEventRow = {
  id: string;
  actorIdentifier: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string | null;
  assetId: string | null;
  requestPath: string | null;
  requestMethod: string | null;
  ipAddress: string | null;
  statusLabel: string;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
};

export type AuditEventListResult = {
  events: AuditEventRow[];
  nextCursor: string | null;
  totalCount: number;
};

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

function buildWhereClause(filters: AuditEventFilters): Prisma.AuditEventWhereInput {
  const where: Prisma.AuditEventWhereInput = {};

  if (filters.actor && filters.actor.trim().length > 0) {
    where.actorIdentifier = { contains: filters.actor.trim(), mode: 'insensitive' };
  }

  if (filters.entityType && filters.entityType.trim().length > 0) {
    where.entityType = { equals: filters.entityType.trim() };
  }

  if (filters.entityId && filters.entityId.trim().length > 0) {
    where.entityId = { equals: filters.entityId.trim() };
  }

  if (filters.severity && filters.severity.trim().length > 0) {
    where.statusLabel = { equals: filters.severity.trim().toUpperCase() };
  }

  // Only apply a bound when it is a real, valid Date. A caller that builds a
  // bound from user input (e.g. `new Date(queryParam)`) can pass an Invalid
  // Date; forwarding `gte: Invalid Date` to Prisma either throws or silently
  // matches nothing, so we ignore unusable bounds instead.
  let validStart = isValidDate(filters.startDate) ? filters.startDate : undefined;
  let validEnd = isValidDate(filters.endDate) ? filters.endDate : undefined;
  // Transposed bounds (`startDate` after `endDate`) describe an impossible
  // window that would silently return zero rows. Normalize by swapping so the
  // caller gets the range they almost certainly meant rather than an empty page.
  if (validStart && validEnd && validStart.getTime() > validEnd.getTime()) {
    [validStart, validEnd] = [validEnd, validStart];
  }
  if (validStart || validEnd) {
    const createdAt: { gte?: Date; lte?: Date } = {};
    if (validStart) {
      createdAt.gte = validStart;
    }
    if (validEnd) {
      createdAt.lte = validEnd;
    }
    where.createdAt = createdAt;
  }

  return where;
}

function isValidDate(value: Date | undefined): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

export async function listAuditEvents(
  filters: AuditEventFilters,
  db: Pick<PrismaClient, 'auditEvent'> = prisma
): Promise<AuditEventListResult> {
  const requestedLimit = filters.limit ?? DEFAULT_LIMIT;
  const safeLimit = Math.max(1, Math.min(MAX_LIMIT, requestedLimit));
  const where = buildWhereClause(filters);
  const trimmedCursor = filters.cursor?.trim();
  const hasCursor = Boolean(trimmedCursor && trimmedCursor.length > 0);

  const [rawEvents, totalCount] = await Promise.all([
    hasCursor
      ? db.auditEvent.findMany({
          where,
          take: safeLimit + 1,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          cursor: { id: trimmedCursor as string },
          skip: 1
        })
      : db.auditEvent.findMany({
          where,
          take: safeLimit + 1,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]
        }),
    db.auditEvent.count({ where })
  ]);

  let nextCursor: string | null = null;
  let pageEvents = rawEvents;
  if (rawEvents.length > safeLimit) {
    const lastVisible = rawEvents[safeLimit - 1];
    nextCursor = lastVisible?.id ?? null;
    pageEvents = rawEvents.slice(0, safeLimit);
  }

  const events: AuditEventRow[] = pageEvents.map((event) => ({
    id: event.id,
    actorIdentifier: event.actorIdentifier,
    actorRole: event.actorRole,
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId,
    assetId: event.assetId,
    requestPath: event.requestPath,
    requestMethod: event.requestMethod,
    ipAddress: event.ipAddress,
    statusLabel: event.statusLabel,
    metadata: event.metadata,
    createdAt: event.createdAt
  }));

  return {
    events,
    nextCursor,
    totalCount
  };
}
