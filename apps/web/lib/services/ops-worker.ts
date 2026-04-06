import { ResearchSyncTriggerType, SourceRefreshTriggerType, type PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { runResearchWorkspaceSync } from '@/lib/services/research/workspace';
import { runSourceRefreshJob } from '@/lib/services/source-refresh';

type OpsCycleDeps = {
  runSourceRefreshJob: typeof runSourceRefreshJob;
  runResearchWorkspaceSync: typeof runResearchWorkspaceSync;
};

function getRetryAttempts(env: NodeJS.ProcessEnv = process.env) {
  const parsed = Number(env.OPS_CYCLE_RETRY_ATTEMPTS ?? 2);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 2;
}

function getRetryBackoffMs(env: NodeJS.ProcessEnv = process.env) {
  const parsed = Number(env.OPS_CYCLE_RETRY_BACKOFF_MS ?? 1000);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 1000;
}

async function sleep(ms: number) {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runOpsCycle(
  input: {
    actorIdentifier?: string | null;
    scheduled?: boolean;
  } = {},
  db: PrismaClient = prisma,
  deps: OpsCycleDeps = {
    runSourceRefreshJob,
    runResearchWorkspaceSync
  }
) {
  const actorIdentifier = input.actorIdentifier?.trim() || (input.scheduled ? 'ops-cron' : 'ops-manual');
  const retryAttempts = getRetryAttempts();
  const retryBackoffMs = getRetryBackoffMs();
  const sourceTriggerType = input.scheduled ? SourceRefreshTriggerType.SCHEDULED : SourceRefreshTriggerType.MANUAL;
  const researchTriggerType = input.scheduled ? ResearchSyncTriggerType.SCHEDULED : ResearchSyncTriggerType.MANUAL;

  let sourceRun: Awaited<ReturnType<typeof runSourceRefreshJob>> | null = null;
  let sourceAttemptCount = 0;
  let sourceError: string | null = null;

  for (let attempt = 1; attempt <= retryAttempts; attempt += 1) {
    sourceAttemptCount = attempt;
    try {
      sourceRun = await deps.runSourceRefreshJob(
        {
          triggerType: sourceTriggerType,
          actorIdentifier
        },
        db
      );
      sourceError = null;
      break;
    } catch (error) {
      sourceError = error instanceof Error ? error.message : 'source refresh failed';
      if (attempt < retryAttempts) {
        await sleep(retryBackoffMs * attempt);
      }
    }
  }

  if (!sourceRun) {
    throw new Error(`Source refresh failed after ${sourceAttemptCount} attempt(s): ${sourceError ?? 'unknown error'}`);
  }

  let researchRun: Awaited<ReturnType<typeof runResearchWorkspaceSync>> | null = null;
  let researchAttemptCount = 0;
  let researchError: string | null = null;

  for (let attempt = 1; attempt <= retryAttempts; attempt += 1) {
    researchAttemptCount = attempt;
    try {
      researchRun = await deps.runResearchWorkspaceSync(
        {
          triggerType: researchTriggerType,
          actorIdentifier
        },
        db
      );
      researchError = null;
      break;
    } catch (error) {
      researchError = error instanceof Error ? error.message : 'research sync failed';
      if (attempt < retryAttempts) {
        await sleep(retryBackoffMs * attempt);
      }
    }
  }

  if (!researchRun) {
    throw new Error(`Research sync failed after ${researchAttemptCount} attempt(s): ${researchError ?? 'unknown error'}`);
  }

  return {
    actorIdentifier,
    sourceRun,
    researchRun,
    alertSummary:
      sourceAttemptCount > 1 || researchAttemptCount > 1
        ? `Ops cycle recovered after retry. Source attempts ${sourceAttemptCount}, research attempts ${researchAttemptCount}.`
        : 'Ops cycle completed without retry.',
    attemptSummary: {
      sourceAttemptCount,
      researchAttemptCount
    }
  };
}
