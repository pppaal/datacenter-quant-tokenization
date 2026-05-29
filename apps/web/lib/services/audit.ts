import crypto from 'node:crypto';
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
  /** Optional snapshot of the entity state before the mutation. */
  before?: Prisma.InputJsonValue | null;
  /** Optional snapshot of the entity state after the mutation. */
  after?: Prisma.InputJsonValue | null;
};

/**
 * Subset of an `AuditEvent` row required to compute / verify its hash.
 * Kept narrow so verification works against any read projection.
 */
export type HashableAuditEvent = {
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
  metadata: unknown;
  beforeState: unknown;
  afterState: unknown;
  createdAt: Date;
  prevHash: string | null;
};

/**
 * Deterministically serialize a value (objects with sorted keys) so that the
 * canonical string is stable across runs and JSON key-ordering differences.
 */
function canonicalize(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`);
  return `{${entries.join(',')}}`;
}

/**
 * Compute the SHA-256 record hash over an event's canonical fields, including
 * the prior event's `recordHash` (carried in `prevHash`). Any tampering with a
 * field, or removal of an earlier row, breaks the chain at the affected link.
 */
export function computeAuditRecordHash(event: HashableAuditEvent): string {
  const canonical = canonicalize({
    id: event.id,
    actorIdentifier: event.actorIdentifier,
    actorRole: event.actorRole,
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId ?? null,
    assetId: event.assetId ?? null,
    requestPath: event.requestPath ?? null,
    requestMethod: event.requestMethod ?? null,
    ipAddress: event.ipAddress ?? null,
    statusLabel: event.statusLabel,
    metadata: event.metadata ?? null,
    beforeState: event.beforeState ?? null,
    afterState: event.afterState ?? null,
    createdAt: event.createdAt instanceof Date ? event.createdAt.toISOString() : event.createdAt,
    prevHash: event.prevHash ?? null
  });
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}

export async function recordAuditEvent(
  input: AuditEventInput,
  db: Pick<PrismaClient, 'auditEvent'> = prisma
) {
  // Link to the most recent event by sequence to form the hash chain. Reading
  // the tip and writing the new row are racy under high concurrency; the
  // strictly-monotonic `sequence` column lets `verifyAuditChain` detect any
  // resulting gap or reorder, and the DB append-only trigger prevents
  // after-the-fact rewrites that would otherwise hide a break.
  const tip = await db.auditEvent.findFirst({
    orderBy: { sequence: 'desc' },
    select: { recordHash: true }
  });
  const prevHash = tip?.recordHash ?? null;

  const id = crypto.randomUUID();
  const createdAt = new Date();
  const base = {
    id,
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
    metadata: input.metadata ?? null,
    beforeState: input.before ?? null,
    afterState: input.after ?? null,
    createdAt,
    prevHash
  };

  const recordHash = computeAuditRecordHash(base);

  return db.auditEvent.create({
    data: {
      id,
      actorIdentifier: base.actorIdentifier,
      actorRole: base.actorRole,
      action: base.action,
      entityType: base.entityType,
      entityId: base.entityId,
      assetId: base.assetId,
      requestPath: base.requestPath,
      requestMethod: base.requestMethod,
      ipAddress: base.ipAddress,
      statusLabel: base.statusLabel,
      metadata: input.metadata ?? undefined,
      beforeState: input.before ?? undefined,
      afterState: input.after ?? undefined,
      createdAt,
      prevHash,
      recordHash
    }
  });
}

export type AuditChainVerification =
  | { ok: true; checked: number }
  | {
      ok: false;
      checked: number;
      brokenAt: { id: string; sequence: number; reason: string } | null;
    };

/**
 * Walk the audit chain in sequence order and confirm every link:
 *   - each row's `recordHash` matches a recomputation of its fields,
 *   - each row's `prevHash` equals the prior row's `recordHash`,
 *   - the `sequence` column has no gaps (a deleted row leaves a hole).
 * Returns the first break found, or `{ ok: true }` when the chain is intact.
 */
export async function verifyAuditChain(
  db: Pick<PrismaClient, 'auditEvent'> = prisma
): Promise<AuditChainVerification> {
  const events = (await db.auditEvent.findMany({
    orderBy: { sequence: 'asc' }
  })) as Array<HashableAuditEvent & { sequence: number; recordHash: string | null }>;

  let prevHash: string | null = null;
  let prevSequence: number | null = null;

  for (const event of events) {
    if (prevSequence !== null && event.sequence !== prevSequence + 1) {
      return {
        ok: false,
        checked: events.length,
        brokenAt: {
          id: event.id,
          sequence: event.sequence,
          reason: `sequence gap: expected ${prevSequence + 1}, got ${event.sequence}`
        }
      };
    }

    if ((event.prevHash ?? null) !== prevHash) {
      return {
        ok: false,
        checked: events.length,
        brokenAt: { id: event.id, sequence: event.sequence, reason: 'prevHash mismatch' }
      };
    }

    const expected = computeAuditRecordHash({ ...event, prevHash: event.prevHash ?? null });
    if (event.recordHash !== expected) {
      return {
        ok: false,
        checked: events.length,
        brokenAt: { id: event.id, sequence: event.sequence, reason: 'recordHash mismatch' }
      };
    }

    prevHash = event.recordHash;
    prevSequence = event.sequence;
  }

  return { ok: true, checked: events.length };
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
  const staleHoursRaw = Number(
    input.env?.OPS_ALERT_STALE_HOURS ?? process.env.OPS_ALERT_STALE_HOURS ?? 6
  );
  const staleHours = Number.isFinite(staleHoursRaw) && staleHoursRaw > 0 ? staleHoursRaw : 6;
  const failureStreakThresholdRaw = Number(
    input.env?.OPS_ALERT_FAILURE_STREAK ?? process.env.OPS_ALERT_FAILURE_STREAK ?? 2
  );
  const failureStreakThreshold =
    Number.isFinite(failureStreakThresholdRaw) && failureStreakThresholdRaw > 0
      ? Math.floor(failureStreakThresholdRaw)
      : 2;
  const recentResearchFailures = input.researchSyncRuns.filter(
    (run) => run.statusLabel === 'FAILED'
  );
  const recentSourceFailures = input.sourceRefreshRuns.filter(
    (run) => run.statusLabel === 'FAILED'
  );
  const latestResearchRun = input.researchSyncRuns[0] ?? null;
  const latestSourceRun = input.sourceRefreshRuns[0] ?? null;
  const now = Date.now();
  const staleCutoff = staleHours * 60 * 60 * 1000;

  const latestResearchRunStale = latestResearchRun
    ? now - latestResearchRun.startedAt.getTime() > staleCutoff
    : true;
  const latestSourceRunStale = latestSourceRun
    ? now - latestSourceRun.startedAt.getTime() > staleCutoff
    : true;

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
    interventionItems.push(
      `Research sync has failed ${researchLeadingFailureStreak} runs in a row.`
    );
  }
  if (sourceLeadingFailureStreak >= failureStreakThreshold) {
    interventionItems.push(
      `Source refresh has failed ${sourceLeadingFailureStreak} runs in a row.`
    );
  }
  if (latestResearchRunStale) {
    interventionItems.push(`Research sync is stale beyond ${staleHours}h.`);
  }
  if (latestSourceRunStale) {
    interventionItems.push(`Source refresh is stale beyond ${staleHours}h.`);
  }

  return {
    hasActiveAlert:
      latestResearchRun?.statusLabel === 'FAILED' || latestSourceRun?.statusLabel === 'FAILED',
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
          : (interventionItems[0] ?? 'Latest ops runs completed successfully.')
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
      detail:
        'Documents are stored on local disk. Use external object storage before production deployment.'
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
          | Array<
              { isActive: 'asc' | 'desc' } | { role: 'asc' | 'desc' } | { name: 'asc' | 'desc' }
            >;
        select: {
          id: true;
          name: true;
          email: true;
          role: true;
          isActive: true;
          sessionVersion: true;
        };
      }): Promise<
        Array<{
          id: string;
          name: string;
          email: string;
          role: string;
          isActive: boolean;
          sessionVersion: number;
        }>
      >;
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
  const actorSummaryMap = new Map<
    string,
    { actorIdentifier: string; actorRole: string; eventCount: number; lastSeenAt: Date }
  >();

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
    actorSummary: [...actorSummaryMap.values()].sort(
      (left, right) => right.lastSeenAt.getTime() - left.lastSeenAt.getTime()
    ),
    storageReadiness: getDocumentStorageReadiness(env),
    aiReadiness: getAiReadiness(env)
  };
}
