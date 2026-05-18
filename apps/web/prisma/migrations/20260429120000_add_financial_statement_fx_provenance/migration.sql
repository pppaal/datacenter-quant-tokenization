-- FinancialStatement integrity hardening:
-- 1. Capture the original filing currency separately from the *Krw values
--    so a USD/JPY-denominated statement can round-trip without ambiguity.
-- 2. Pin the FX snapshot used for the conversion so the same row reads the
--    same way after market rates move (otherwise IC sees different numbers
--    for the same statement on different days).
-- 3. Tag provenance — DART vs upload vs manual — so reconciliation logic
--    can prefer the regulator-filed copy when one exists.
-- 4. Enforce uniqueness on (asset, counterparty, type, year, period) when
--    all four are populated, so duplicate intake doesn't silently accumulate
--    competing copies for the same fiscal period.

ALTER TABLE "FinancialStatement"
  ADD COLUMN IF NOT EXISTS "sourceCurrency"   TEXT,
  ADD COLUMN IF NOT EXISTS "fxRateToKrw"      DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "fxAsOf"           TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "provenanceSystem" TEXT;

-- Partial index: only enforces uniqueness when the period is fully
-- specified. Pre-existing rows with NULL fiscalYear/fiscalPeriod (early
-- intake) are unaffected and don't block the migration.
CREATE UNIQUE INDEX IF NOT EXISTS "FinancialStatement_period_unique"
  ON "FinancialStatement"("assetId", "counterpartyId", "statementType", "fiscalYear", "fiscalPeriod")
  WHERE "fiscalYear" IS NOT NULL AND "fiscalPeriod" IS NOT NULL;
