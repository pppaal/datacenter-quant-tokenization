-- Proprietary deal flow log.
--
-- The Deal table tracks our own deal pipeline (SOURCED → DD → CLOSED).
-- Brokerages also see deals we DON'T pursue, and that signal is itself
-- valuable for the cap-rate / pricing view: "5 office sale processes
-- live in Yeouido this quarter, sponsor mix shifting from REIT to
-- private equity" is a signal we can't get from REB or MOLIT.
-- DealFlowEntry captures that as an operator-driven intake.
--
-- dealType / status are TEXT not enum so the taxonomy can grow
-- ('SALE', 'REFINANCE', 'JV', 'RECAP', 'CAPEX_LOAN', 'DEVELOPMENT';
--  'LIVE', 'CLOSED', 'WITHDRAWN', 'LOST') without an ALTER TYPE
-- migration.

CREATE TABLE IF NOT EXISTS "DealFlowEntry" (
    "id"              TEXT NOT NULL,
    "market"          TEXT NOT NULL,
    "region"          TEXT,
    "assetClass"      "AssetClass",
    "assetTier"       TEXT,
    "dealType"        TEXT NOT NULL,
    "status"          TEXT NOT NULL DEFAULT 'LIVE',
    "assetName"       TEXT,
    "estimatedSizeKrw" DOUBLE PRECISION,
    "estimatedCapPct" DOUBLE PRECISION,
    "sponsor"         TEXT,
    "brokerSource"    TEXT,
    "observedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes"           TEXT,
    "recordedById"    TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealFlowEntry_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DealFlowEntry_recordedById_fkey" FOREIGN KEY ("recordedById")
      REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "DealFlowEntry_market_type_status_idx"
  ON "DealFlowEntry"("market", "dealType", "status", "observedAt");

CREATE INDEX IF NOT EXISTS "DealFlowEntry_assetclass_observed_idx"
  ON "DealFlowEntry"("assetClass", "observedAt");
