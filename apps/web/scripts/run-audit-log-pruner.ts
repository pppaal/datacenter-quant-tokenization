/**
 * Operational-log retention pruner.
 *
 * AML/audit evidence is NOT hard-deleted here. `AuditEvent` is a
 * tamper-evident, append-only hash chain (DB triggers reject UPDATE/DELETE),
 * and Korea 자본시장법 / 특정금융정보법 require retaining transaction- and
 * compliance-related records for ~5–10 years. Deleting audit rows would both
 * break the chain (a sequence gap) and destroy regulatory evidence, so this
 * job:
 *   - AuditEvent  → NEVER deletes. It reports rows older than the regulatory
 *                   floor (AUDIT_RETENTION_DAYS, default 3650 = 10y) so an
 *                   operator can ARCHIVE/EXPORT them out-of-band before any
 *                   manual, audited removal. Removal stays gated behind
 *                   `AUDIT_ALLOW_HARD_DELETE=1` AND a successful prior export
 *                   (not implemented here on purpose).
 *
 * The following operational (non-evidentiary) rows are still pruned older than
 * their window:
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
import type { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/observability/logger';

const DAY_MS = 24 * 60 * 60 * 1000;

type PrunerDb = Pick<
  PrismaClient,
  'auditEvent' | 'opsAlertDelivery' | 'notification' | 'opsWorkItem'
>;
// Regulatory retention floor for audit evidence (10 years). The pruner refuses
// to delete AuditEvent rows younger than this regardless of AUDIT_RETENTION_DAYS.
const AUDIT_REGULATORY_FLOOR_DAYS = 3650;

function readDaysEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${name} must be a positive number, got "${raw}".`);
  }
  return n;
}

export async function runAuditPrune(
  options: { dryRun?: boolean } = {},
  db: PrunerDb = prisma
): Promise<{
  dryRun: boolean;
  audit: { eligible: number; deleted: number };
  opsAlert: { eligible: number; deleted: number };
  notification: { eligible: number; deleted: number };
  opsWorkItem: { eligible: number; deleted: number };
  cutoffs: { audit: string; opsAlert: string; notification: string; opsWorkItem: string };
}> {
  const dryRun = options.dryRun ?? false;
  // Audit evidence retention floor: never shorter than the regulatory floor.
  const auditRetentionDays = Math.max(
    readDaysEnv('AUDIT_RETENTION_DAYS', AUDIT_REGULATORY_FLOOR_DAYS),
    AUDIT_REGULATORY_FLOOR_DAYS
  );
  const opsAlertRetentionDays = readDaysEnv('OPS_ALERT_DELIVERY_RETENTION_DAYS', 180);
  const notificationRetentionDays = readDaysEnv('NOTIFICATION_RETENTION_DAYS', 90);
  const opsWorkItemRetentionDays = readDaysEnv('OPS_WORK_ITEM_RETENTION_DAYS', 30);

  const now = new Date();
  const auditCutoff = new Date(now.getTime() - auditRetentionDays * DAY_MS);
  const opsAlertCutoff = new Date(now.getTime() - opsAlertRetentionDays * DAY_MS);
  const notificationCutoff = new Date(now.getTime() - notificationRetentionDays * DAY_MS);
  const opsWorkItemCutoff = new Date(now.getTime() - opsWorkItemRetentionDays * DAY_MS);

  const [auditCount, opsAlertCount, notificationCount, opsWorkItemCount] = await Promise.all([
    db.auditEvent.count({ where: { createdAt: { lt: auditCutoff } } }),
    db.opsAlertDelivery.count({ where: { createdAt: { lt: opsAlertCutoff } } }),
    db.notification.count({
      where: { readAt: { not: null }, createdAt: { lt: notificationCutoff } }
    }),
    db.opsWorkItem.count({
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

  // AuditEvent is append-only regulatory evidence: NEVER hard-deleted here.
  // The `auditCount` above is reported for archival visibility only. Any actual
  // removal must go through an audited export + an explicit, separately-gated
  // tool — the DB trigger also rejects DELETE on AuditEvent at the engine level.
  if (auditCount > 0) {
    logger.warn('audit_pruner_evidence_retained', {
      message:
        'AuditEvent rows beyond retention floor are retained (append-only evidence). Archive/export out-of-band before any manual removal.',
      auditEligibleBeyondFloor: auditCount,
      auditCutoff: auditCutoff.toISOString()
    });
  }

  const [opsAlertDeleted, notificationDeleted, opsWorkItemDeleted] = await Promise.all([
    db.opsAlertDelivery.deleteMany({ where: { createdAt: { lt: opsAlertCutoff } } }),
    db.notification.deleteMany({
      where: { readAt: { not: null }, createdAt: { lt: notificationCutoff } }
    }),
    db.opsWorkItem.deleteMany({
      where: {
        createdAt: { lt: opsWorkItemCutoff },
        OR: [{ status: 'SUCCEEDED' }, { status: 'DEAD_LETTER' }]
      }
    })
  ]);

  logger.info('audit_pruner_result', {
    auditDeleted: 0,
    auditRetained: auditCount,
    opsAlertDeleted: opsAlertDeleted.count,
    notificationDeleted: notificationDeleted.count,
    opsWorkItemDeleted: opsWorkItemDeleted.count
  });

  return {
    dryRun,
    audit: { eligible: auditCount, deleted: 0 },
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
      logger.error('audit_pruner_failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
