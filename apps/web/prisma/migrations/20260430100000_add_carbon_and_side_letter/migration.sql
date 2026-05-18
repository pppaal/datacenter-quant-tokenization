-- CarbonEmissionRecord — actual measurements per scope/vintage
-- replacing the IM's derived estimate when on file.
CREATE TABLE IF NOT EXISTS "CarbonEmissionRecord" (
  "id"           TEXT NOT NULL,
  "assetId"      TEXT NOT NULL,
  "scope"        INTEGER NOT NULL,
  "category"     TEXT NOT NULL,
  "vintageYear"  INTEGER NOT NULL,
  "tco2e"        DOUBLE PRECISION NOT NULL,
  "methodology"  TEXT,
  "verifiedBy"   TEXT,
  "sourceSystem" TEXT,
  "notes"        TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CarbonEmissionRecord_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CarbonEmissionRecord_assetId_fkey"
    FOREIGN KEY ("assetId") REFERENCES "Asset"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "CarbonEmissionRecord_assetId_scope_vintageYear_idx"
  ON "CarbonEmissionRecord" ("assetId", "scope", "vintageYear");

-- SideLetter — LP-specific terms register.
CREATE TABLE IF NOT EXISTS "SideLetter" (
  "id"            TEXT NOT NULL,
  "assetId"       TEXT NOT NULL,
  "lpName"        TEXT NOT NULL,
  "lpEntityType"  TEXT,
  "termCategory"  TEXT NOT NULL,
  "termSummary"   TEXT NOT NULL,
  "effectiveFrom" TIMESTAMP(3),
  "expiresOn"     TIMESTAMP(3),
  "mfnEligible"   BOOLEAN NOT NULL DEFAULT FALSE,
  "notes"         TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SideLetter_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SideLetter_assetId_fkey"
    FOREIGN KEY ("assetId") REFERENCES "Asset"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "SideLetter_assetId_termCategory_idx"
  ON "SideLetter" ("assetId", "termCategory");

CREATE INDEX IF NOT EXISTS "SideLetter_lpName_idx"
  ON "SideLetter" ("lpName");
