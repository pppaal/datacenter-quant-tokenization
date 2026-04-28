import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import {
  persistOpsAlertAttempts,
  recordOpsAlertDelivery,
  sendOpsWebhookAlerts
} from '@/lib/services/ops-alerts';
import { runOpsCycle } from '@/lib/services/ops-worker';

async function main() {
  const actorIdentifier = process.env.OPS_ACTOR?.trim() || 'ops-script';
  const environmentLabel =
    process.env.VERCEL_ENV?.trim() || process.env.NODE_ENV?.trim() || 'unknown';
  console.log('[ops] starting combined ops cycle...');
  const { sourceRun, researchRun, alertSummary, attemptSummary } = await runOpsCycle(
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
  console.log(`[ops] ${alertSummary}`);
  console.log(
    `[ops] attempt summary - source ${attemptSummary.sourceAttemptCount}, research ${attemptSummary.researchAttemptCount}.`
  );

  const alert = await sendOpsWebhookAlerts({
    status: 'SUCCESS',
    actorIdentifier,
    alertSummary,
    attemptSummary,
    sourceRun,
    researchRun
  });
  await persistOpsAlertAttempts(
    alert.attempts,
    {
      actorIdentifier,
      environmentLabel,
      payload: {
        status: 'SUCCESS',
        actorIdentifier,
        alertSummary,
        attemptSummary,
        sourceRun: {
          id: sourceRun.id,
          statusLabel: sourceRun.statusLabel
        },
        researchRun: {
          id: researchRun.id,
          statusLabel: researchRun.statusLabel
        }
      }
    },
    prisma
  );

  if (alert.deliveredAny) {
    const deliveredAttempt = alert.attempts.find((attempt) => attempt.delivered);
    console.log(
      `[ops] webhook alert delivered via ${deliveredAttempt?.channel ?? 'unknown'} (${deliveredAttempt?.reason ?? 'delivered'}).`
    );
  } else {
    console.log('[ops] no webhook delivery succeeded.');
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    const actorIdentifier = process.env.OPS_ACTOR?.trim() || 'ops-script';
    const environmentLabel =
      process.env.VERCEL_ENV?.trim() || process.env.NODE_ENV?.trim() || 'unknown';
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[ops] cycle failed:', errorMessage);

    try {
      const alert = await sendOpsWebhookAlerts({
        status: 'FAILED',
        actorIdentifier,
        alertSummary: 'Ops cycle failed before completing source refresh and research sync.',
        errorMessage
      });
      await persistOpsAlertAttempts(
        alert.attempts,
        {
          actorIdentifier,
          environmentLabel,
          payload: {
            status: 'FAILED',
            actorIdentifier,
            alertSummary: 'Ops cycle failed before completing source refresh and research sync.',
            errorMessage
          }
        },
        prisma
      );
      if (alert.deliveredAny) {
        const deliveredAttempt = alert.attempts.find((attempt) => attempt.delivered);
        console.error(
          `[ops] webhook alert delivered via ${deliveredAttempt?.channel ?? 'unknown'} (${deliveredAttempt?.reason ?? 'delivered'}).`
        );
      }
    } catch (alertError) {
      try {
        await recordOpsAlertDelivery(
          {
            channel: 'webhook_primary',
            destination: process.env.OPS_ALERT_WEBHOOK_URL?.trim() || 'not_configured',
            statusLabel: 'FAILED',
            reason: 'delivery_error',
            actorIdentifier,
            environmentLabel,
            errorMessage: alertError instanceof Error ? alertError.message : String(alertError),
            payload: {
              status: 'FAILED',
              actorIdentifier,
              alertSummary: 'Ops cycle failed before completing source refresh and research sync.',
              errorMessage
            }
          },
          prisma
        );
      } catch {
        // Swallow logging failures during terminal ops failure handling.
      }
      console.error(
        '[ops] webhook alert failed:',
        alertError instanceof Error ? alertError.message : String(alertError)
      );
    }

    await prisma.$disconnect();
    process.exit(1);
  });
