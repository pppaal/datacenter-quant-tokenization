-- AML/CDD compliance primitives + tamper-evident audit-log hash chain.
--
-- Scoped strictly to this PR's objects. Pre-existing, unrelated index-rename
-- drift (DealFlowEntry, DocumentEmbedding, MarketIndicatorSeries,
-- SponsorPriorDeal, TenantDemand, TransactionComp) that `prisma migrate dev`
-- tried to fold in is intentionally EXCLUDED — that belongs in a separate
-- reconcile migration (see 20260428080000_reconcile_schema_drift). Every
-- statement here is idempotent (IF NOT EXISTS / DO-$$-duplicate_object) so it
-- applies cleanly regardless of prior drift state.

-- ---------------------------------------------------------------------------
-- AuditEvent: hash-chain + before/after state snapshots.
-- ---------------------------------------------------------------------------
ALTER TABLE "AuditEvent"
  ADD COLUMN IF NOT EXISTS "beforeState" JSONB,
  ADD COLUMN IF NOT EXISTS "afterState" JSONB,
  ADD COLUMN IF NOT EXISTS "prevHash" TEXT,
  ADD COLUMN IF NOT EXISTS "recordHash" TEXT,
  ADD COLUMN IF NOT EXISTS "sequence" SERIAL;

CREATE INDEX IF NOT EXISTS "AuditEvent_sequence_idx" ON "AuditEvent"("sequence");

-- ---------------------------------------------------------------------------
-- AuditEvent: DB-level append-only immutability.
--
-- A BEFORE UPDATE/DELETE trigger raises an exception so even a compromised
-- application role cannot rewrite or erase audit evidence. This complements
-- the application-level hash chain: tampering is both blocked AND detectable.
-- (Pruning of audit rows is likewise blocked; the retention script no longer
-- attempts it.)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "auditEvent_append_only"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditEvent is append-only: % is not permitted', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER "auditEvent_no_update"
    BEFORE UPDATE ON "AuditEvent"
    FOR EACH ROW EXECUTE FUNCTION "auditEvent_append_only"();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER "auditEvent_no_delete"
    BEFORE DELETE ON "AuditEvent"
    FOR EACH ROW EXECUTE FUNCTION "auditEvent_append_only"();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- Investor: accreditation / suitability (적격투자자 · 전문투자자).
-- ---------------------------------------------------------------------------
ALTER TABLE "Investor"
  ADD COLUMN IF NOT EXISTS "accreditationStatus" TEXT,
  ADD COLUMN IF NOT EXISTS "accreditedAt" TIMESTAMP(3);

-- ---------------------------------------------------------------------------
-- BeneficialOwner (실소유자)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "BeneficialOwner" (
    "id" TEXT NOT NULL,
    "investorId" TEXT,
    "counterpartyId" TEXT,
    "name" TEXT NOT NULL,
    "ownershipPct" DOUBLE PRECISION,
    "relationship" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "nationality" TEXT,
    "verificationStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "verifiedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BeneficialOwner_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BeneficialOwner_investorId_idx" ON "BeneficialOwner"("investorId");
CREATE INDEX IF NOT EXISTS "BeneficialOwner_counterpartyId_idx" ON "BeneficialOwner"("counterpartyId");
CREATE INDEX IF NOT EXISTS "BeneficialOwner_verificationStatus_idx" ON "BeneficialOwner"("verificationStatus");

-- ---------------------------------------------------------------------------
-- ScreeningResult (sanctions / PEP screening evidence)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "ScreeningResult" (
    "id" TEXT NOT NULL,
    "investorId" TEXT,
    "counterpartyId" TEXT,
    "beneficialOwnerId" TEXT,
    "subjectName" TEXT NOT NULL,
    "subjectDob" TIMESTAMP(3),
    "subjectCountry" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'local',
    "listType" TEXT,
    "matchScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isPep" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'CLEAR',
    "matchedEntries" JSONB,
    "screenedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rescreenDueAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScreeningResult_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ScreeningResult_investorId_screenedAt_idx" ON "ScreeningResult"("investorId", "screenedAt");
CREATE INDEX IF NOT EXISTS "ScreeningResult_counterpartyId_screenedAt_idx" ON "ScreeningResult"("counterpartyId", "screenedAt");
CREATE INDEX IF NOT EXISTS "ScreeningResult_status_screenedAt_idx" ON "ScreeningResult"("status", "screenedAt");
CREATE INDEX IF NOT EXISTS "ScreeningResult_rescreenDueAt_idx" ON "ScreeningResult"("rescreenDueAt");

-- ---------------------------------------------------------------------------
-- AmlRiskRating (위험평가)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "AmlRiskRating" (
    "id" TEXT NOT NULL,
    "investorId" TEXT NOT NULL,
    "rating" TEXT NOT NULL DEFAULT 'LOW',
    "score" INTEGER NOT NULL DEFAULT 0,
    "factors" JSONB,
    "ratedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ratedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AmlRiskRating_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AmlRiskRating_investorId_key" ON "AmlRiskRating"("investorId");
CREATE INDEX IF NOT EXISTS "AmlRiskRating_rating_idx" ON "AmlRiskRating"("rating");

-- ---------------------------------------------------------------------------
-- SuspiciousActivityReport (의심거래보고 / STR scaffold)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "SuspiciousActivityReport" (
    "id" TEXT NOT NULL,
    "investorId" TEXT,
    "counterpartyId" TEXT,
    "reason" TEXT NOT NULL,
    "details" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "raisedBy" TEXT,
    "filedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SuspiciousActivityReport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SuspiciousActivityReport_status_createdAt_idx" ON "SuspiciousActivityReport"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "SuspiciousActivityReport_investorId_idx" ON "SuspiciousActivityReport"("investorId");

-- ---------------------------------------------------------------------------
-- Foreign keys (guarded against re-run)
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  ALTER TABLE "BeneficialOwner" ADD CONSTRAINT "BeneficialOwner_investorId_fkey" FOREIGN KEY ("investorId") REFERENCES "Investor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "BeneficialOwner" ADD CONSTRAINT "BeneficialOwner_counterpartyId_fkey" FOREIGN KEY ("counterpartyId") REFERENCES "Counterparty"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ScreeningResult" ADD CONSTRAINT "ScreeningResult_investorId_fkey" FOREIGN KEY ("investorId") REFERENCES "Investor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ScreeningResult" ADD CONSTRAINT "ScreeningResult_counterpartyId_fkey" FOREIGN KEY ("counterpartyId") REFERENCES "Counterparty"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ScreeningResult" ADD CONSTRAINT "ScreeningResult_beneficialOwnerId_fkey" FOREIGN KEY ("beneficialOwnerId") REFERENCES "BeneficialOwner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "AmlRiskRating" ADD CONSTRAINT "AmlRiskRating_investorId_fkey" FOREIGN KEY ("investorId") REFERENCES "Investor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "SuspiciousActivityReport" ADD CONSTRAINT "SuspiciousActivityReport_investorId_fkey" FOREIGN KEY ("investorId") REFERENCES "Investor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "SuspiciousActivityReport" ADD CONSTRAINT "SuspiciousActivityReport_counterpartyId_fkey" FOREIGN KEY ("counterpartyId") REFERENCES "Counterparty"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
