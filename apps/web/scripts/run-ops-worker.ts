import { OpsWorkType } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { drainOpsWorkQueue, enqueueOpsWorkItem } from '@/lib/services/ops-queue';

async function main() {
  const shouldEnqueueCycle = process.argv.includes('--enqueue-cycle');
  const actorIdentifier = process.env.OPS_ACTOR?.trim() || 'ops-worker';

  if (shouldEnqueueCycle) {
    const item = await enqueueOpsWorkItem(
      {
        workType: OpsWorkType.OPS_CYCLE,
        actorIdentifier
      },
      prisma
    );
    console.log(`[ops-worker] enqueued ${item.workType} work item ${item.id}`);
  }

  const processed = await drainOpsWorkQueue(prisma, {
    limit: 10
  });
  console.log(`[ops-worker] processed ${processed.length} queued work item(s).`);
  for (const item of processed) {
    console.log(`[ops-worker] ${item.id} -> ${item.status}`);
  }

  if (processed.some((item) => item.status === 'FAILED' || item.status === 'DEAD_LETTER')) {
    throw new Error('One or more queued ops work items failed or dead-lettered.');
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error('[ops-worker] failed:', error instanceof Error ? error.message : String(error));
    await prisma.$disconnect();
    process.exit(1);
  });
