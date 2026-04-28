import { OpsWorkType } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { drainOpsWorkQueue, enqueueOpsWorkItem } from '@/lib/services/ops-queue';

function getPollIntervalMs(env: NodeJS.ProcessEnv = process.env) {
  const parsed = Number(env.OPS_WORKER_POLL_MS ?? 15000);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 15000;
}

function getDrainLimit(env: NodeJS.ProcessEnv = process.env) {
  const parsed = Number(env.OPS_WORKER_BATCH_SIZE ?? 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 10;
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const shouldEnqueueCycle = process.argv.includes('--enqueue-cycle');
  const actorIdentifier = process.env.OPS_ACTOR?.trim() || 'ops-worker-daemon';
  const pollIntervalMs = getPollIntervalMs();
  const drainLimit = getDrainLimit();

  if (shouldEnqueueCycle) {
    const item = await enqueueOpsWorkItem(
      {
        workType: OpsWorkType.OPS_CYCLE,
        actorIdentifier
      },
      prisma
    );
    console.log(`[ops-worker-daemon] enqueued ${item.workType} work item ${item.id}`);
  }

  console.log(
    `[ops-worker-daemon] starting poll loop with interval ${pollIntervalMs}ms and batch ${drainLimit}.`
  );

  while (true) {
    const processed = await drainOpsWorkQueue(prisma, {
      limit: drainLimit
    });
    if (processed.length > 0) {
      console.log(`[ops-worker-daemon] processed ${processed.length} queued work item(s).`);
      for (const item of processed) {
        console.log(`[ops-worker-daemon] ${item.id} -> ${item.status}`);
      }
    }

    await sleep(pollIntervalMs);
  }
}

main().catch(async (error) => {
  console.error(
    '[ops-worker-daemon] failed:',
    error instanceof Error ? error.message : String(error)
  );
  await prisma.$disconnect();
  process.exit(1);
});
