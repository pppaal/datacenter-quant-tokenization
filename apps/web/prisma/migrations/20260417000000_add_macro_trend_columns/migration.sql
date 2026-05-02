-- Add trend analysis columns to MacroFactor.
-- Uses IF NOT EXISTS so the migration is idempotent against databases that
-- already received these columns via the reconciliation migration or via
-- `prisma db push`. Requires PostgreSQL 9.6+.
ALTER TABLE "MacroFactor" ADD COLUMN IF NOT EXISTS "trendDirection" TEXT;
ALTER TABLE "MacroFactor" ADD COLUMN IF NOT EXISTS "trendMomentum" DOUBLE PRECISION;
ALTER TABLE "MacroFactor" ADD COLUMN IF NOT EXISTS "trendAcceleration" DOUBLE PRECISION;
ALTER TABLE "MacroFactor" ADD COLUMN IF NOT EXISTS "anomalyZScore" DOUBLE PRECISION;
ALTER TABLE "MacroFactor" ADD COLUMN IF NOT EXISTS "movingAvg3" DOUBLE PRECISION;
ALTER TABLE "MacroFactor" ADD COLUMN IF NOT EXISTS "movingAvg6" DOUBLE PRECISION;
ALTER TABLE "MacroFactor" ADD COLUMN IF NOT EXISTS "movingAvg12" DOUBLE PRECISION;
