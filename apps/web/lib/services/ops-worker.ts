import { ResearchSyncTriggerType, SourceRefreshTriggerType, type PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { runResearchWorkspaceSync } from '@/lib/services/research/workspace';
import { runSourceRefreshJob } from '@/lib/services/source-refresh';

type OpsCycleDeps = {
  runSourceRefreshJob: typeof runSourceRefreshJob;
  runResearchWorkspaceSync: typeof runResearchWorkspaceSync;
};

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
  const sourceRun = await deps.runSourceRefreshJob(
    {
      triggerType: input.scheduled ? SourceRefreshTriggerType.SCHEDULED : SourceRefreshTriggerType.MANUAL,
      actorIdentifier
    },
    db
  );

  const researchRun = await deps.runResearchWorkspaceSync(
    {
      triggerType: input.scheduled ? ResearchSyncTriggerType.SCHEDULED : ResearchSyncTriggerType.MANUAL,
      actorIdentifier
    },
    db
  );

  return {
    actorIdentifier,
    sourceRun,
    researchRun
  };
}
