import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import {
  getAdminIdentityBindingSummary,
  listAdminIdentityUserCandidates,
  listAdminOperatorSeats,
  listRecentAdminIdentityBindings
} from '@/lib/security/admin-identity';
import { listRecentOpsAlertDeliveries } from '@/lib/services/ops-alerts';

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

export function buildOpsAlertSummary(input: {
  researchSyncRuns: Array<{ statusLabel: string; startedAt: Date; errorSummary?: string | null }>;
  sourceRefreshRuns: Array<{ statusLabel: string; startedAt: Date; errorSummary?: string | null }>;
  env?: NodeJS.ProcessEnv;
}) {
  const staleHoursRaw = Number(input.env?.OPS_ALERT_STALE_HOURS ?? process.env.OPS_ALERT_STALE_HOURS ?? 6);
  const staleHours = Number.isFinite(staleHoursRaw) && staleHoursRaw > 0 ? staleHoursRaw : 6;
  const failureStreakThresholdRaw = Number(
    input.env?.OPS_ALERT_FAILURE_STREAK ?? process.env.OPS_ALERT_FAILURE_STREAK ?? 2
  );
  const failureStreakThreshold =
    Number.isFinite(failureStreakThresholdRaw) && failureStreakThresholdRaw > 0
      ? Math.floor(failureStreakThresholdRaw)
      : 2;
  const recentResearchFailures = input.researchSyncRuns.filter((run) => run.statusLabel === 'FAILED');
  const recentSourceFailures = input.sourceRefreshRuns.filter((run) => run.statusLabel === 'FAILED');
  const latestResearchRun = input.researchSyncRuns[0] ?? null;
  const latestSourceRun = input.sourceRefreshRuns[0] ?? null;
  const now = Date.now();
  const staleCutoff = staleHours * 60 * 60 * 1000;

  const latestResearchRunStale =
    latestResearchRun ? now - latestResearchRun.startedAt.getTime() > staleCutoff : true;
  const latestSourceRunStale =
    latestSourceRun ? now - latestSourceRun.startedAt.getTime() > staleCutoff : true;

  const countLeadingFailures = (runs: Array<{ statusLabel: string }>) => {
    let streak = 0;
    for (const run of runs) {
      if (run.statusLabel !== 'FAILED') break;
      streak += 1;
    }
    return streak;
  };

  const researchLeadingFailureStreak = countLeadingFailures(input.researchSyncRuns);
  const sourceLeadingFailureStreak = countLeadingFailures(input.sourceRefreshRuns);

  const interventionItems: string[] = [];
  if (researchLeadingFailureStreak >= failureStreakThreshold) {
    interventionItems.push(`Research sync has failed ${researchLeadingFailureStreak} runs in a row.`);
  }
  if (sourceLeadingFailureStreak >= failureStreakThreshold) {
    interventionItems.push(`Source refresh has failed ${sourceLeadingFailureStreak} runs in a row.`);
  }
  if (latestResearchRunStale) {
    interventionItems.push(`Research sync is stale beyond ${staleHours}h.`);
  }
  if (latestSourceRunStale) {
    interventionItems.push(`Source refresh is stale beyond ${staleHours}h.`);
  }

  return {
    hasActiveAlert:
      (latestResearchRun?.statusLabel === 'FAILED') ||
      (latestSourceRun?.statusLabel === 'FAILED'),
    requiresIntervention: interventionItems.length > 0,
    researchFailureCount: recentResearchFailures.length,
    sourceFailureCount: recentSourceFailures.length,
    researchFailureStreak: researchLeadingFailureStreak,
    sourceFailureStreak: sourceLeadingFailureStreak,
    latestResearchRunStale,
    latestSourceRunStale,
    latestResearchRunStartedAt: latestResearchRun?.startedAt ?? null,
    latestSourceRunStartedAt: latestSourceRun?.startedAt ?? null,
    staleHours,
    failureStreakThreshold,
    interventionItems,
    headline:
      latestResearchRun?.statusLabel === 'FAILED'
        ? latestResearchRun.errorSummary || 'Latest research sync failed.'
        : latestSourceRun?.statusLabel === 'FAILED'
          ? latestSourceRun.errorSummary || 'Latest source refresh failed.'
          : interventionItems[0] ?? 'Latest ops runs completed successfully.'
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
  db: {
    auditEvent: PrismaClient['auditEvent'];
    researchSyncRun: PrismaClient['researchSyncRun'];
    sourceRefreshRun: PrismaClient['sourceRefreshRun'];
    adminIdentityBinding?: {
      count(args?: { where?: { userId?: { not: null } } }): Promise<number>;
      findFirst(args: {
        orderBy: {
          lastSeenAt: 'desc';
        };
        select: {
          lastSeenAt: true;
        };
      }): Promise<{ lastSeenAt: Date } | null>;
      findMany(args: {
        take: number;
        where?: {
          userId?: null;
        };
        orderBy: {
          lastSeenAt: 'desc';
        };
        select: {
          id: true;
          provider: true;
          subject: true;
          userId: true;
          emailSnapshot: true;
          identifierSnapshot: true;
          lastSeenAt: true;
        };
      }): Promise<
        Array<{
          id: string;
          provider: string;
          subject: string;
          userId: string | null;
          emailSnapshot: string | null;
          identifierSnapshot: string;
          lastSeenAt: Date;
        }>
      >;
    };
    user: {
      findMany(args: {
        take: number;
        orderBy:
          | Array<{ role: 'asc' | 'desc' } | { name: 'asc' | 'desc' }>
          | Array<{ isActive: 'asc' | 'desc' } | { role: 'asc' | 'desc' } | { name: 'asc' | 'desc' }>;
        select: {
          id: true;
          name: true;
          email: true;
          role: true;
          isActive: true;
          sessionVersion: true;
        };
      }): Promise<Array<{ id: string; name: string; email: string; role: string; isActive: boolean; sessionVersion: number }>>;
    };
    opsAlertDelivery: {
      findMany(args: {
        take: number;
        orderBy: {
          createdAt: 'desc';
        };
      }): Promise<
        Array<{
          id: string;
          channel: string;
          destination: string;
          statusLabel: string;
          reason: string | null;
          actorIdentifier: string | null;
          environmentLabel: string | null;
          errorMessage: string | null;
          deliveredAt: Date | null;
          createdAt: Date;
        }>
      >;
    };
    opsWorkItem?: {
      findMany(args: {
        take: number;
        orderBy: {
          createdAt: 'desc';
        };
      }): Promise<
        Array<{
          id: string;
          workType: string;
          status: string;
          actorIdentifier: string | null;
          attemptCount: number;
          maxAttempts: number;
          lastError: string | null;
          deadLetteredAt: Date | null;
          scheduledFor: Date;
          createdAt: Date;
        }>
      >;
    };
  } = prisma,
  env: NodeJS.ProcessEnv = process.env
) {
  const [
    auditEvents,
    opsRuns,
    identityBindings,
    recentUnmappedIdentityBindings,
    identityCandidates,
    operatorSeats,
    opsAlertDeliveries,
    opsWorkItems
  ] = await Promise.all([
    listAuditEvents({ limit: 60 }, db),
    listRecentOpsRuns(db),
    getAdminIdentityBindingSummary(db),
    listRecentAdminIdentityBindings(db, {
      onlyUnmapped: true,
      limit: 6
    }),
    listAdminIdentityUserCandidates(
      {
        user: {
          findMany: async (args) => {
            const users = await db.user.findMany({
              ...args,
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
                isActive: true,
                sessionVersion: true
              }
            });

            return users.map(({ id, name, email, role }) => ({
              id,
              name,
              email,
              role
            }));
          }
        }
      },
      {
        limit: 24
      }
    ),
    listAdminOperatorSeats(
      {
        user: {
          findMany: (args) =>
            db.user.findMany({
              ...args,
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
                isActive: true,
                sessionVersion: true
              }
            })
        }
      },
      {
        limit: 30
      }
    ),
    listRecentOpsAlertDeliveries(
      {
        opsAlertDelivery: db.opsAlertDelivery
      },
      {
        limit: 12
      }
    ),
    db.opsWorkItem
      ? db.opsWorkItem.findMany({
          take: 12,
          orderBy: {
            createdAt: 'desc'
          }
        })
      : Promise.resolve([])
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
    opsAlerts: buildOpsAlertSummary({ ...opsRuns, env }),
    identityBindings: {
      ...identityBindings,
      recentUnmapped: recentUnmappedIdentityBindings,
      userCandidates: identityCandidates
    },
    operatorSeats,
    opsAlertDeliveries,
    opsWorkItems,
    actorSummary: [...actorSummaryMap.values()].sort((left, right) => right.lastSeenAt.getTime() - left.lastSeenAt.getTime()),
    storageReadiness: getDocumentStorageReadiness(env),
    aiReadiness: getAiReadiness(env)
  };
}
