/**
 * Audit-log retention pruner.
 *
 * Deletes `AuditEvent`, `OpsAlertDelivery`, and resolved `Notification` rows
 * older than the configured retention window. Configure via env vars:
 *
 *   AUDIT_RETENTION_DAYS                (default 365)
 *   OPS_ALERT_DELIVERY_RETENTION_DAYS   (default 180)
 *   NOTIFICATION_RETENTION_DAYS         (default 90)
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

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const auditRetentionDays = readDaysEnv('AUDIT_RETENTION_DAYS', 365);
  const opsAlertRetentionDays = readDaysEnv('OPS_ALERT_DELIVERY_RETENTION_DAYS', 180);
  const notificationRetentionDays = readDaysEnv('NOTIFICATION_RETENTION_DAYS', 90);

  const now = new Date();
  const auditCutoff = new Date(now.getTime() - auditRetentionDays * DAY_MS);
  const opsAlertCutoff = new Date(now.getTime() - opsAlertRetentionDays * DAY_MS);
  const notificationCutoff = new Date(now.getTime() - notificationRetentionDays * DAY_MS);

  const auditCount = await prisma.auditEvent.count({ where: { createdAt: { lt: auditCutoff } } });
  const opsAlertCount = await prisma.opsAlertDelivery.count({
    where: { createdAt: { lt: opsAlertCutoff } }
  });
  const notificationCount = await prisma.notification.count({
    where: { readAt: { not: null }, createdAt: { lt: notificationCutoff } }
  });

  logger.info('audit_pruner_plan', {
    dryRun,
    auditCutoff: auditCutoff.toISOString(),
    opsAlertCutoff: opsAlertCutoff.toISOString(),
    notificationCutoff: notificationCutoff.toISOString(),
    auditCount,
    opsAlertCount,
    notificationCount
  });

  if (dryRun) {
    return;
  }

  const auditDeleted = await prisma.auditEvent.deleteMany({
    where: { createdAt: { lt: auditCutoff } }
  });
  const opsAlertDeleted = await prisma.opsAlertDelivery.deleteMany({
    where: { createdAt: { lt: opsAlertCutoff } }
  });
  const notificationDeleted = await prisma.notification.deleteMany({
    where: { readAt: { not: null }, createdAt: { lt: notificationCutoff } }
  });

  logger.info('audit_pruner_result', {
    auditDeleted: auditDeleted.count,
    opsAlertDeleted: opsAlertDeleted.count,
    notificationDeleted: notificationDeleted.count
  });
}

main()
  .catch((error) => {
    logger.error('audit_pruner_failed', { error: error instanceof Error ? error.message : String(error) });
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
