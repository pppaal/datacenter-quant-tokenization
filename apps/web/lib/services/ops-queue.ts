import {
  OpsWorkStatus,
  OpsWorkType,
  Prisma,
  ResearchSyncTriggerType,
  SourceRefreshTriggerType,
  type PrismaClient
} from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { persistOpsAlertAttempts, sendOpsWebhookAlerts } from '@/lib/services/ops-alerts';
import { runOpsCycle } from '@/lib/services/ops-worker';
import { runResearchWorkspaceSync } from '@/lib/services/research/workspace';
import { runSourceRefreshJob } from '@/lib/services/source-refresh';

function getOpsQueueMaxAttempts(env: NodeJS.ProcessEnv = process.env) {
  const parsed = Number(env.OPS_QUEUE_MAX_ATTEMPTS ?? 3);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 3;
}

function getOpsQueueBackoffMs(env: NodeJS.ProcessEnv = process.env) {
  const parsed = Number(env.OPS_QUEUE_BACKOFF_MS ?? 60000);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 60000;
}

export async function enqueueOpsWorkItem(
  input: {
    workType: OpsWorkType;
    actorIdentifier?: string | null;
    payload?: Record<string, unknown>;
    maxAttempts?: number;
  },
  db: PrismaClient = prisma
) {
  return db.opsWorkItem.create({
    data: {
      workType: input.workType,
      actorIdentifier: input.actorIdentifier ?? null,
        payload: (input.payload as Prisma.InputJsonValue | undefined) ?? undefined,
      maxAttempts: input.maxAttempts ?? getOpsQueueMaxAttempts()
    }
  });
}

export async function listRecentOpsWorkItems(
  db: Pick<PrismaClient, 'opsWorkItem'> = prisma,
  options?: { limit?: number }
) {
  return db.opsWorkItem.findMany({
    take: options?.limit ?? 20,
    orderBy: {
      createdAt: 'desc'
    }
  });
}

export async function replayOpsWorkItem(
  input: {
    workItemId: string;
    actorIdentifier?: string | null;
  },
  db: Pick<PrismaClient, 'opsWorkItem'> = prisma
) {
  const workItem = await db.opsWorkItem.findUnique({
    where: {
      id: input.workItemId
    }
  });

  if (!workItem) {
    throw new Error('Ops work item was not found.');
  }

  return db.opsWorkItem.update({
    where: {
      id: workItem.id
    },
    data: {
      status: OpsWorkStatus.QUEUED,
      scheduledFor: new Date(),
      lockedAt: null,
      startedAt: null,
      finishedAt: null,
      deadLetteredAt: null,
      lastError: null,
      actorIdentifier: input.actorIdentifier?.trim() || workItem.actorIdentifier
    }
  });
}

async function runOpsWorkItem(
  item: {
    id: string;
    workType: OpsWorkType;
    actorIdentifier: string | null;
    payload: unknown;
  },
  db: PrismaClient
) {
  switch (item.workType) {
    case OpsWorkType.OPS_CYCLE:
      return runOpsCycle(
        {
          actorIdentifier: item.actorIdentifier ?? 'ops-queue',
          scheduled: true
        },
        db
      );
    case OpsWorkType.SOURCE_REFRESH:
      return runSourceRefreshJob(
        {
          triggerType: SourceRefreshTriggerType.SCHEDULED,
          actorIdentifier: item.actorIdentifier ?? 'ops-queue'
        },
        db
      );
    case OpsWorkType.RESEARCH_SYNC:
      return runResearchWorkspaceSync(
        {
          triggerType: ResearchSyncTriggerType.SCHEDULED,
          actorIdentifier: item.actorIdentifier ?? 'ops-queue'
        },
        db
      );
    default:
      throw new Error(`Unsupported ops work type: ${item.workType}`);
  }
}

export async function drainOpsWorkQueue(
  db: PrismaClient = prisma,
  options?: {
    limit?: number;
  }
) {
  const limit = options?.limit ?? 5;
  const now = new Date();
  const backoffMs = getOpsQueueBackoffMs();
  const processed: Array<{ id: string; status: OpsWorkStatus }> = [];
  const environmentLabel = process.env.VERCEL_ENV?.trim() || process.env.NODE_ENV?.trim() || 'unknown';

  for (let index = 0; index < limit; index += 1) {
    const nextItem = await db.opsWorkItem.findFirst({
      where: {
        status: OpsWorkStatus.QUEUED,
        scheduledFor: {
          lte: now
        }
      },
      orderBy: [
        {
          scheduledFor: 'asc'
        },
        {
          createdAt: 'asc'
        }
      ]
    });

    if (!nextItem) {
      break;
    }

    const runningItem = await db.opsWorkItem.update({
      where: {
        id: nextItem.id
      },
      data: {
        status: OpsWorkStatus.RUNNING,
        lockedAt: new Date(),
        startedAt: new Date()
      }
    });

    const attemptNumber = runningItem.attemptCount + 1;
    const attempt = await db.opsWorkAttempt.create({
      data: {
        opsWorkItemId: runningItem.id,
        attemptNumber,
        statusLabel: 'RUNNING'
      }
    });

    try {
      const result = await runOpsWorkItem(runningItem, db);
      if (runningItem.workType === OpsWorkType.OPS_CYCLE) {
        const alert = await sendOpsWebhookAlerts(
          {
            status: 'SUCCESS',
            actorIdentifier: runningItem.actorIdentifier?.trim() || 'ops-queue',
            alertSummary:
              'alertSummary' in result && typeof result.alertSummary === 'string'
                ? result.alertSummary
                : 'Queued ops cycle completed successfully.',
            attemptSummary:
              'attemptSummary' in result && typeof result.attemptSummary === 'object'
                ? (result.attemptSummary as { sourceAttemptCount: number; researchAttemptCount: number })
                : undefined,
            sourceRun:
              'sourceRun' in result && result.sourceRun && typeof result.sourceRun === 'object'
                ? {
                    id: (result.sourceRun as { id?: string }).id,
                    statusLabel: (result.sourceRun as { statusLabel?: string }).statusLabel
                  }
                : undefined,
            researchRun:
              'researchRun' in result && result.researchRun && typeof result.researchRun === 'object'
                ? {
                    id: (result.researchRun as { id?: string }).id,
                    statusLabel: (result.researchRun as { statusLabel?: string }).statusLabel
                  }
                : undefined
          }
        );

        await persistOpsAlertAttempts(
          alert.attempts,
          {
            actorIdentifier: runningItem.actorIdentifier?.trim() || 'ops-queue',
            environmentLabel,
            payload: {
              status: 'SUCCESS',
              actorIdentifier: runningItem.actorIdentifier?.trim() || 'ops-queue',
              workItemId: runningItem.id,
              alertSummary:
                'alertSummary' in result && typeof result.alertSummary === 'string'
                  ? result.alertSummary
                  : 'Queued ops cycle completed successfully.'
            }
          },
          db
        );
      }

      await db.opsWorkAttempt.update({
        where: {
          id: attempt.id
        },
        data: {
          statusLabel: 'SUCCEEDED',
          finishedAt: new Date(),
          metadata: result as any
        }
      });
      await db.opsWorkItem.update({
        where: {
          id: runningItem.id
        },
        data: {
          status: OpsWorkStatus.SUCCEEDED,
          attemptCount: attemptNumber,
          finishedAt: new Date(),
          lockedAt: null,
          lastError: null
        }
      });
      processed.push({
        id: runningItem.id,
        status: OpsWorkStatus.SUCCEEDED
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Queued ops work failed.';
      const deadLetter = attemptNumber >= runningItem.maxAttempts;

      if (runningItem.workType === OpsWorkType.OPS_CYCLE) {
        const alert = await sendOpsWebhookAlerts({
          status: 'FAILED',
          actorIdentifier: runningItem.actorIdentifier?.trim() || 'ops-queue',
          alertSummary: 'Queued ops cycle failed before completing source refresh and research sync.',
          errorMessage
        });

        await persistOpsAlertAttempts(
          alert.attempts,
          {
            actorIdentifier: runningItem.actorIdentifier?.trim() || 'ops-queue',
            environmentLabel,
            payload: {
              status: 'FAILED',
              actorIdentifier: runningItem.actorIdentifier?.trim() || 'ops-queue',
              workItemId: runningItem.id,
              alertSummary: 'Queued ops cycle failed before completing source refresh and research sync.',
              errorMessage
            }
          },
          db
        );
      }

      await db.opsWorkAttempt.update({
        where: {
          id: attempt.id
        },
        data: {
          statusLabel: deadLetter ? 'DEAD_LETTER' : 'FAILED',
          finishedAt: new Date(),
          errorMessage
        }
      });

      await db.opsWorkItem.update({
        where: {
          id: runningItem.id
        },
        data: {
          status: deadLetter ? OpsWorkStatus.DEAD_LETTER : OpsWorkStatus.QUEUED,
          attemptCount: attemptNumber,
          lastError: errorMessage,
          finishedAt: deadLetter ? new Date() : null,
          lockedAt: null,
          scheduledFor: deadLetter ? runningItem.scheduledFor : new Date(Date.now() + backoffMs * attemptNumber),
          deadLetteredAt: deadLetter ? new Date() : null
        }
      });

      processed.push({
        id: runningItem.id,
        status: deadLetter ? OpsWorkStatus.DEAD_LETTER : OpsWorkStatus.FAILED
      });
    }
  }

  return processed;
}
