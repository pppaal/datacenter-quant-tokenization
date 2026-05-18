-- Sponsor track-record models.
--
-- Real REPE IMs include a "Sponsor track record" page when the deal
-- is a JV: prior deals vintage, equity multiple, gross IRR, exit year.
-- LPs read this to underwrite manager skill, not just the deal.
--
-- Design choice — match by name, not FK. The Asset table already
-- carries sponsorName as free text (operator-typed). Adding a
-- sponsorId FK would force backfill. The IM lookup matches Sponsor
-- by case-insensitive name; non-match → no track-record card.

CREATE TABLE IF NOT EXISTS "Sponsor" (
    "id"            TEXT NOT NULL,
    "name"          TEXT NOT NULL,
    "shortName"     TEXT,
    "hqMarket"      TEXT,
    "aumKrw"        DOUBLE PRECISION,
    "fundCount"     INTEGER,
    "yearFounded"   INTEGER,
    "websiteUrl"    TEXT,
    "notes"         TEXT,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sponsor_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Sponsor_name_key"
  ON "Sponsor"("name");

CREATE TABLE IF NOT EXISTS "SponsorPriorDeal" (
    "id"             TEXT NOT NULL,
    "sponsorId"      TEXT NOT NULL,
    "dealName"       TEXT NOT NULL,
    "vintageYear"    INTEGER NOT NULL,
    "exitYear"       INTEGER,
    "assetClass"     "AssetClass",
    "market"         TEXT,
    "equityKrw"      DOUBLE PRECISION,
    "equityMultiple" DOUBLE PRECISION,
    "grossIrrPct"    DOUBLE PRECISION,
    "status"         TEXT NOT NULL DEFAULT 'EXITED',
    "notes"          TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SponsorPriorDeal_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SponsorPriorDeal_sponsorId_fkey" FOREIGN KEY ("sponsorId")
      REFERENCES "Sponsor"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "SponsorPriorDeal_sponsorId_vintage_idx"
  ON "SponsorPriorDeal"("sponsorId", "vintageYear");
