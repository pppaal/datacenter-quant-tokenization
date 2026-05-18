-- Tenant in the Market tracker.
--
-- CBRE / JLL leasing brokerages maintain a private list of named
-- tenants actively requirementing space ("Samsung Electronics looking
-- for 5,000 sqm in Gangnam, target Q3 2026 occupancy"). Without a
-- corresponding model the operator has no way to capture this signal,
-- which is the highest-quality input to a forward-looking rent and
-- vacancy view.
--
-- Status values: ACTIVE (still searching), SIGNED (closed a lease),
-- WITHDRAWN (paused / cancelled). Stored as TEXT (no enum) so the
-- taxonomy can grow without an ALTER TYPE migration.

CREATE TABLE IF NOT EXISTS "TenantDemand" (
    "id"               TEXT NOT NULL,
    "tenantName"       TEXT NOT NULL,
    "market"           TEXT NOT NULL,
    "region"           TEXT,
    "assetClass"       "AssetClass",
    "assetTier"        TEXT,
    "targetSizeSqm"    DOUBLE PRECISION,
    "targetMoveInDate" TIMESTAMP(3),
    "status"           TEXT NOT NULL DEFAULT 'ACTIVE',
    "notes"            TEXT,
    "source"           TEXT,
    "observedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedById"     TEXT,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantDemand_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TenantDemand_recordedById_fkey" FOREIGN KEY ("recordedById")
      REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- The dashboard scans by market × asset-class × status. Composite
-- index keeps that filter cheap as the corpus grows.
CREATE INDEX IF NOT EXISTS "TenantDemand_market_class_status_idx"
  ON "TenantDemand"("market", "assetClass", "status", "observedAt");

-- Submarket-level rollups order by observation recency.
CREATE INDEX IF NOT EXISTS "TenantDemand_region_observed_idx"
  ON "TenantDemand"("region", "observedAt");
