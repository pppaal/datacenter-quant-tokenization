import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';

export type AuditEventInput = {
  actorIdentifier?: string | null;
  actorRole?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  assetId?: string | null;
  requestPath?: string | null;
  requestMethod?: string | null;
  ipAddress?: string | null;
  statusLabel?: string | null;
  metadata?: Prisma.InputJsonValue | null;
};

export async function recordAuditEvent(
  input: AuditEventInput,
  db: Pick<PrismaClient, 'auditEvent'> = prisma
) {
  return db.auditEvent.create({
    data: {
      actorIdentifier: input.actorIdentifier?.trim() || 'unknown_actor',
      actorRole: input.actorRole?.trim() || 'UNKNOWN',
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      assetId: input.assetId ?? null,
      requestPath: input.requestPath ?? null,
      requestMethod: input.requestMethod ?? null,
      ipAddress: input.ipAddress ?? null,
      statusLabel: input.statusLabel ?? 'SUCCESS',
      metadata: input.metadata ?? undefined
    }
  });
}

export async function listAuditEvents(
  options?: {
    limit?: number;
  },
  db: Pick<PrismaClient, 'auditEvent'> = prisma
) {
  return db.auditEvent.findMany({
    take: options?.limit ?? 40,
    orderBy: {
      createdAt: 'desc'
    }
  });
}

export async function listRecentOpsRuns(
  db: Pick<PrismaClient, 'researchSyncRun' | 'sourceRefreshRun'> = prisma
) {
  const [researchSyncRuns, sourceRefreshRuns] = await Promise.all([
    db.researchSyncRun.findMany({
      take: 6,
      orderBy: {
        startedAt: 'desc'
      }
    }),
    db.sourceRefreshRun.findMany({
      take: 6,
      orderBy: {
        startedAt: 'desc'
      }
    })
  ]);

  return {
    researchSyncRuns,
    sourceRefreshRuns
  };
}

export function getDocumentStorageReadiness(env: NodeJS.ProcessEnv = process.env) {
  const bucket = env.DOCUMENT_STORAGE_BUCKET?.trim() ?? '';
  const endpoint = env.DOCUMENT_STORAGE_ENDPOINT?.trim() ?? '';
  const accessKey = env.DOCUMENT_STORAGE_ACCESS_KEY_ID?.trim() ?? '';
  const secretKey = env.DOCUMENT_STORAGE_SECRET_ACCESS_KEY?.trim() ?? '';

  if (!bucket && !endpoint && !accessKey && !secretKey) {
    return {
      mode: 'local',
      status: 'warning',
      detail: 'Documents are stored on local disk. Use external object storage before production deployment.'
    } as const;
  }

  if (bucket && endpoint && accessKey && secretKey) {
    return {
      mode: 'object_storage_ready',
      status: 'good',
      detail: 'External object storage credentials are configured.'
    } as const;
  }

  return {
    mode: 'partial',
    status: 'danger',
    detail: 'Document object-storage credentials are partially configured.'
  } as const;
}

export function getAiReadiness(env: NodeJS.ProcessEnv = process.env) {
  return {
    model: env.OPENAI_MODEL?.trim() || 'unset',
    hasApiKey: Boolean(env.OPENAI_API_KEY?.trim())
  };
}

export async function getSecurityOverview(
  db: Pick<PrismaClient, 'auditEvent' | 'researchSyncRun' | 'sourceRefreshRun'> = prisma,
  env: NodeJS.ProcessEnv = process.env
) {
  const [auditEvents, opsRuns] = await Promise.all([
    listAuditEvents({ limit: 60 }, db),
    listRecentOpsRuns(db)
  ]);
  const actorSummaryMap = new Map<string, { actorIdentifier: string; actorRole: string; eventCount: number; lastSeenAt: Date }>();

  for (const event of auditEvents) {
    const key = `${event.actorIdentifier}:${event.actorRole}`;
    const existing = actorSummaryMap.get(key);

    if (existing) {
      existing.eventCount += 1;
      if (event.createdAt > existing.lastSeenAt) {
        existing.lastSeenAt = event.createdAt;
      }
      continue;
    }

    actorSummaryMap.set(key, {
      actorIdentifier: event.actorIdentifier,
      actorRole: event.actorRole,
      eventCount: 1,
      lastSeenAt: event.createdAt
    });
  }

  return {
    auditEvents,
    opsRuns,
    actorSummary: [...actorSummaryMap.values()].sort((left, right) => right.lastSeenAt.getTime() - left.lastSeenAt.getTime()),
    storageReadiness: getDocumentStorageReadiness(env),
    aiReadiness: getAiReadiness(env)
  };
}
