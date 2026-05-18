-- Indexed lookup for `isDuplicateOpsAlert` (lib/services/ops-alerts.ts):
-- WHERE "reason" = $1 AND "deliveredAt" >= $2 ORDER BY "deliveredAt" DESC.
-- Without the index, the dedup check scans the full alert delivery
-- history; with `(reason, deliveredAt)` it becomes an index-range read.
CREATE INDEX IF NOT EXISTS "OpsAlertDelivery_reason_deliveredAt_idx"
  ON "OpsAlertDelivery"("reason", "deliveredAt");
