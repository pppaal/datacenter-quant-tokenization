import { prisma } from '@/lib/db/prisma';
import { sendOpsWebhookAlert } from '@/lib/services/ops-alerts';
import { runOpsCycle } from '@/lib/services/ops-worker';

async function main() {
  const actorIdentifier = process.env.OPS_ACTOR?.trim() || 'ops-script';
  console.log('[ops] starting combined ops cycle...');
  const { sourceRun, researchRun, alertSummary, attemptSummary } = await runOpsCycle({
    actorIdentifier,
    scheduled: false
  }, prisma);
  console.log(
    `[ops] source refresh ${sourceRun.statusLabel.toLowerCase()} - refreshed ${sourceRun.refreshedAssetCount}, failed ${sourceRun.failedAssetCount}.`
  );
  console.log(
    `[ops] research sync ${researchRun.statusLabel.toLowerCase()} - official ${researchRun.officialSourceCount}, dossiers ${researchRun.assetDossierCount}.`
  );
  console.log(`[ops] ${alertSummary}`);
  console.log(
    `[ops] attempt summary - source ${attemptSummary.sourceAttemptCount}, research ${attemptSummary.researchAttemptCount}.`
  );

  const alert = await sendOpsWebhookAlert({
    status: 'SUCCESS',
    actorIdentifier,
    alertSummary,
    attemptSummary,
    sourceRun,
    researchRun
  });

  if (alert.delivered) {
    console.log(`[ops] webhook alert delivered (${alert.reason}).`);
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    const actorIdentifier = process.env.OPS_ACTOR?.trim() || 'ops-script';
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[ops] cycle failed:', errorMessage);

    try {
      const alert = await sendOpsWebhookAlert({
        status: 'FAILED',
        actorIdentifier,
        alertSummary: 'Ops cycle failed before completing source refresh and research sync.',
        errorMessage
      });
      if (alert.delivered) {
        console.error(`[ops] webhook alert delivered (${alert.reason}).`);
      }
    } catch (alertError) {
      console.error(
        '[ops] webhook alert failed:',
        alertError instanceof Error ? alertError.message : String(alertError)
      );
    }

    await prisma.$disconnect();
    process.exit(1);
  });
