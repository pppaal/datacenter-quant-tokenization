-- Convert the capital-account money columns from Float (double precision) to
-- Decimal(20, 2). This mirrors 20260429160000_financial_statement_decimal: Float8
-- silently rounds beyond ~10^15, and these are exactly the columns where rounding
-- error compounds across roll-ups — LP capital accounts (called/distributed),
-- fund aggregates, and the call/distribution allocations that feed PCAP/DPI/TVPI.
--
-- Decimal(20, 2) covers values up to 999,999,999,999,999,999.99. The USING clause
-- casts any existing value; NULLs pass through. PG rewrites each table once
-- (sub-second at single-tenant operator scale). Existing DEFAULT 0 columns keep
-- their default through the numeric→numeric cast.
--
-- NOTE: `prisma migrate dev` also emits a spurious
--   DROP INDEX "DocumentEmbedding_embedding_hnsw_idx";
-- because Prisma 5 cannot represent the pgvector HNSW index on the
-- Unsupported("vector(...)") column. That DROP is intentionally omitted (the
-- index is created in 20260429150000 and must survive) — the CI drift guard
-- strips the same false-positive.

ALTER TABLE "Fund"
  ALTER COLUMN "targetSizeKrw"       TYPE NUMERIC(20, 2) USING "targetSizeKrw"::NUMERIC(20, 2),
  ALTER COLUMN "committedCapitalKrw" TYPE NUMERIC(20, 2) USING "committedCapitalKrw"::NUMERIC(20, 2),
  ALTER COLUMN "investedCapitalKrw"  TYPE NUMERIC(20, 2) USING "investedCapitalKrw"::NUMERIC(20, 2),
  ALTER COLUMN "dryPowderKrw"        TYPE NUMERIC(20, 2) USING "dryPowderKrw"::NUMERIC(20, 2);

ALTER TABLE "Commitment"
  ALTER COLUMN "commitmentKrw"  TYPE NUMERIC(20, 2) USING "commitmentKrw"::NUMERIC(20, 2),
  ALTER COLUMN "calledKrw"      TYPE NUMERIC(20, 2) USING "calledKrw"::NUMERIC(20, 2),
  ALTER COLUMN "distributedKrw" TYPE NUMERIC(20, 2) USING "distributedKrw"::NUMERIC(20, 2),
  ALTER COLUMN "recallableKrw"  TYPE NUMERIC(20, 2) USING "recallableKrw"::NUMERIC(20, 2);

ALTER TABLE "CapitalCall"
  ALTER COLUMN "amountKrw" TYPE NUMERIC(20, 2) USING "amountKrw"::NUMERIC(20, 2);

ALTER TABLE "CapitalCallAllocation"
  ALTER COLUMN "amountKrw" TYPE NUMERIC(20, 2) USING "amountKrw"::NUMERIC(20, 2);

ALTER TABLE "Distribution"
  ALTER COLUMN "amountKrw" TYPE NUMERIC(20, 2) USING "amountKrw"::NUMERIC(20, 2);

ALTER TABLE "DistributionAllocation"
  ALTER COLUMN "amountKrw" TYPE NUMERIC(20, 2) USING "amountKrw"::NUMERIC(20, 2);
