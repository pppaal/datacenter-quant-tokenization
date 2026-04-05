import { prisma } from '@/lib/db/prisma';
import { runOpsCycle } from '@/lib/services/ops-worker';

async function main() {
  const actorIdentifier = process.env.OPS_ACTOR?.trim() || 'ops-script';
  console.log('[ops] starting combined ops cycle...');
  const { sourceRun, researchRun } = await runOpsCycle(
    {
      actorIdentifier,
      scheduled: false
    },
    prisma
  );
  console.log(
    `[ops] source refresh ${sourceRun.statusLabel.toLowerCase()} - refreshed ${sourceRun.refreshedAssetCount}, failed ${sourceRun.failedAssetCount}.`
  );
  console.log(
    `[ops] research sync ${researchRun.statusLabel.toLowerCase()} - official ${researchRun.officialSourceCount}, dossiers ${researchRun.assetDossierCount}.`
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error('[ops] cycle failed:', error instanceof Error ? error.message : error);
    await prisma.$disconnect();
    process.exit(1);
  });
