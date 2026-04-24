-- SourceCitation — canonical provenance record used to trace any data point
-- back to its primary source (news article, regulatory filing, research report,
-- government series, etc). citationKey is an external idempotency key so
-- ingesters can upsert without duplicates.
CREATE TABLE "SourceCitation" (
    "id"              TEXT NOT NULL,
    "citationKey"     TEXT NOT NULL,
    "sourceType"      TEXT NOT NULL,
    "publisher"       TEXT NOT NULL,
    "publisherUrl"    TEXT,
    "articleUrl"      TEXT,
    "title"           TEXT NOT NULL,
    "snippet"         TEXT,
    "publishedAt"     TIMESTAMP(3),
    "fetchedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rawPayload"      JSONB,
    "language"        TEXT,
    "confidenceScore" DOUBLE PRECISION,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceCitation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SourceCitation_citationKey_key" ON "SourceCitation"("citationKey");
CREATE INDEX "SourceCitation_sourceType_publishedAt_idx" ON "SourceCitation"("sourceType", "publishedAt");
CREATE INDEX "SourceCitation_publisher_idx" ON "SourceCitation"("publisher");

-- Link MacroSeries rows to the citation that attests each observation.
-- Nullable + SET NULL on delete so legacy rows (no citation) and citation
-- pruning don't cascade into the time series.
ALTER TABLE "MacroSeries" ADD COLUMN "citationId" TEXT;

CREATE INDEX "MacroSeries_citationId_idx" ON "MacroSeries"("citationId");

ALTER TABLE "MacroSeries"
  ADD CONSTRAINT "MacroSeries_citationId_fkey"
  FOREIGN KEY ("citationId") REFERENCES "SourceCitation"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
