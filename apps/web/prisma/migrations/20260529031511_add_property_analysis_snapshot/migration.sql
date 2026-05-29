-- Immutable system-of-record for click-to-analyze property analyses.
-- Append-only: a re-analysis of the same parcel produces a NEW row, never an
-- update. Guarded with IF NOT EXISTS per the repo convention (see
-- 20260428080000_reconcile_schema_drift) so the migration is idempotent and
-- safe against a DB that already received this table via `db push`.
--
-- NOTE: `prisma migrate dev` additionally surfaced pre-existing index-rename
-- drift between the shipped migration chain and schema.prisma. That drift is
-- intentionally NOT folded into this migration — this file is scoped strictly
-- to the new model. Reconciling the unrelated index drift belongs in its own
-- dedicated migration.

-- CreateTable
CREATE TABLE IF NOT EXISTS "PropertyAnalysisSnapshot" (
    "id" TEXT NOT NULL,
    "inputsHash" TEXT NOT NULL,
    "pnu" TEXT NOT NULL,
    "jibunAddress" TEXT NOT NULL,
    "roadAddress" TEXT,
    "districtName" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "assetClass" "AssetClass" NOT NULL,
    "baseCaseValueKrw" DOUBLE PRECISION NOT NULL,
    "verdictTier" TEXT NOT NULL,
    "engineVersion" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "report" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PropertyAnalysisSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PropertyAnalysisSnapshot_pnu_createdAt_idx" ON "PropertyAnalysisSnapshot"("pnu", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PropertyAnalysisSnapshot_assetClass_createdAt_idx" ON "PropertyAnalysisSnapshot"("assetClass", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PropertyAnalysisSnapshot_inputsHash_idx" ON "PropertyAnalysisSnapshot"("inputsHash");
