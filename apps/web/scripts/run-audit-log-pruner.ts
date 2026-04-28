/**
 * Audit-log retention pruner.
 *
 * Deletes the following rows older than the configured retention window:
 *   - AuditEvent                                     (AUDIT_RETENTION_DAYS, default 365)
 *   - OpsAlertDelivery                               (OPS_ALERT_DELIVERY_RETENTION_DAYS, default 180)
 *   - Notification (only `readAt != null`)           (NOTIFICATION_RETENTION_DAYS, default 90)
 *   - OpsWorkItem (terminal: SUCCEEDED / DEAD_LETTER) (OPS_WORK_ITEM_RETENTION_DAYS, default 30)
 *
 * `OpsWorkAttempt` rows are removed automatically via the cascading
 * foreign key on their parent `OpsWorkItem`, so they share the
 * `OPS_WORK_ITEM_RETENTION_DAYS` window without an explicit pass.
 *
 * Pass `--dry-run` to count rows that would be deleted without writing.
 *
 * Schedule this from Vercel Cron (or any external scheduler) using:
 *   `tsx scripts/run-audit-log-pruner.ts`
 *
 * The cutoff is strictly older-than: rows with `createdAt >= cutoff` are
 * always kept so the active investigation window is never affected.
 */
import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/observability/logger';

const DAY_MS = 24 * 60 * 60 * 1000;

function readDaysEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${name} must be a positive number, got "${raw}".`);
  }
  return n;
}

export async function runAuditPrune(options: { dryRun?: boolean } = {}): Promise<{
  dryRun: boolean;
  audit: { eligible: number; deleted: number };
  opsAlert: { eligible: number; deleted: number };
  notification: { eligible: number; deleted: number };
  opsWorkItem: { eligible: number; deleted: number };
  cutoffs: { audit: string; opsAlert: string; notification: string; opsWorkItem: string };
}> {
  const dryRun = options.dryRun ?? false;
  const auditRetentionDays = readDaysEnv('AUDIT_RETENTION_DAYS', 365);
  const opsAlertRetentionDays = readDaysEnv('OPS_ALERT_DELIVERY_RETENTION_DAYS', 180);
  const notificationRetentionDays = readDaysEnv('NOTIFICATION_RETENTION_DAYS', 90);
  const opsWorkItemRetentionDays = readDaysEnv('OPS_WORK_ITEM_RETENTION_DAYS', 30);

  const now = new Date();
  const auditCutoff = new Date(now.getTime() - auditRetentionDays * DAY_MS);
  const opsAlertCutoff = new Date(now.getTime() - opsAlertRetentionDays * DAY_MS);
  const notificationCutoff = new Date(now.getTime() - notificationRetentionDays * DAY_MS);
  const opsWorkItemCutoff = new Date(now.getTime() - opsWorkItemRetentionDays * DAY_MS);

  const [auditCount, opsAlertCount, notificationCount, opsWorkItemCount] = await Promise.all([
    prisma.auditEvent.count({ where: { createdAt: { lt: auditCutoff } } }),
    prisma.opsAlertDelivery.count({ where: { createdAt: { lt: opsAlertCutoff } } }),
    prisma.notification.count({ where: { readAt: { not: null }, createdAt: { lt: notificationCutoff } } }),
    prisma.opsWorkItem.count({
      where: {
        createdAt: { lt: opsWorkItemCutoff },
        OR: [{ status: 'SUCCEEDED' }, { status: 'DEAD_LETTER' }]
      }
    })
  ]);

  logger.info('audit_pruner_plan', {
    dryRun,
    auditCutoff: auditCutoff.toISOString(),
    opsAlertCutoff: opsAlertCutoff.toISOString(),
    notificationCutoff: notificationCutoff.toISOString(),
    opsWorkItemCutoff: opsWorkItemCutoff.toISOString(),
    auditCount,
    opsAlertCount,
    notificationCount,
    opsWorkItemCount
  });

  if (dryRun) {
    return {
      dryRun,
      audit: { eligible: auditCount, deleted: 0 },
      opsAlert: { eligible: opsAlertCount, deleted: 0 },
      notification: { eligible: notificationCount, deleted: 0 },
      opsWorkItem: { eligible: opsWorkItemCount, deleted: 0 },
      cutoffs: {
        audit: auditCutoff.toISOString(),
        opsAlert: opsAlertCutoff.toISOString(),
        notification: notificationCutoff.toISOString(),
        opsWorkItem: opsWorkItemCutoff.toISOString()
      }
    };
  }

  const [auditDeleted, opsAlertDeleted, notificationDeleted, opsWorkItemDeleted] = await Promise.all([
    prisma.auditEvent.deleteMany({ where: { createdAt: { lt: auditCutoff } } }),
    prisma.opsAlertDelivery.deleteMany({ where: { createdAt: { lt: opsAlertCutoff } } }),
    prisma.notification.deleteMany({
      where: { readAt: { not: null }, createdAt: { lt: notificationCutoff } }
    }),
    prisma.opsWorkItem.deleteMany({
      where: {
        createdAt: { lt: opsWorkItemCutoff },
        OR: [{ status: 'SUCCEEDED' }, { status: 'DEAD_LETTER' }]
      }
    })
  ]);

  logger.info('audit_pruner_result', {
    auditDeleted: auditDeleted.count,
    opsAlertDeleted: opsAlertDeleted.count,
    notificationDeleted: notificationDeleted.count,
    opsWorkItemDeleted: opsWorkItemDeleted.count
  });

  return {
    dryRun,
    audit: { eligible: auditCount, deleted: auditDeleted.count },
    opsAlert: { eligible: opsAlertCount, deleted: opsAlertDeleted.count },
    notification: { eligible: notificationCount, deleted: notificationDeleted.count },
    opsWorkItem: { eligible: opsWorkItemCount, deleted: opsWorkItemDeleted.count },
    cutoffs: {
      audit: auditCutoff.toISOString(),
      opsAlert: opsAlertCutoff.toISOString(),
      notification: notificationCutoff.toISOString(),
      opsWorkItem: opsWorkItemCutoff.toISOString()
    }
  };
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  await runAuditPrune({ dryRun });
}

if (require.main === module) {
  main()
    .catch((error) => {
      logger.error('audit_pruner_failed', { error: error instanceof Error ? error.message : String(error) });
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
