-- InsurancePolicy register for the asset insurance card on the IM.
-- policyType / status are TEXT so taxonomy can grow (PROPERTY / BI /
-- LIABILITY / CYBER / CONSTRUCTION / D&O / etc.) without a migration.
CREATE TABLE IF NOT EXISTS "InsurancePolicy" (
  "id"            TEXT NOT NULL,
  "assetId"       TEXT NOT NULL,
  "policyType"    TEXT NOT NULL,
  "insurer"       TEXT NOT NULL,
  "brokerName"    TEXT,
  "coverageKrw"   DOUBLE PRECISION,
  "deductibleKrw" DOUBLE PRECISION,
  "premiumKrw"    DOUBLE PRECISION,
  "currency"      TEXT NOT NULL DEFAULT 'KRW',
  "effectiveFrom" TIMESTAMP(3),
  "expiresOn"     TIMESTAMP(3),
  "status"        TEXT NOT NULL DEFAULT 'ACTIVE',
  "notes"         TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InsurancePolicy_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InsurancePolicy_assetId_fkey"
    FOREIGN KEY ("assetId") REFERENCES "Asset"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "InsurancePolicy_assetId_policyType_status_idx"
  ON "InsurancePolicy" ("assetId", "policyType", "status");
