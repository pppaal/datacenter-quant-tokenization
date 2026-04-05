import { prisma } from '@/lib/db/prisma';
import { runSourceRefreshJob } from '@/lib/services/source-refresh';
import { runResearchWorkspaceSync } from '@/lib/services/research/workspace';

async function main() {
  const actorIdentifier = process.env.OPS_ACTOR?.trim() || 'ops-script';

  console.log('[ops] starting source refresh job...');
  const sourceRun = await runSourceRefreshJob(
    {
      triggerType: 'MANUAL',
      actorIdentifier
    },
    prisma
  );
  console.log(
    `[ops] source refresh ${sourceRun.statusLabel.toLowerCase()} - refreshed ${sourceRun.refreshedAssetCount}, failed ${sourceRun.failedAssetCount}.`
  );

  console.log('[ops] starting research workspace sync...');
  const researchRun = await runResearchWorkspaceSync({
    actorIdentifier,
    triggerType: 'MANUAL'
  });
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
