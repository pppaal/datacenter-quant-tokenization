-- Convert the sponsor money columns from Float (double precision) to
-- Decimal(20, 2). Mirrors 20260603042614_capital_accounts_decimal: Float8
-- silently rounds beyond ~10^15, and AUM / committed equity feed the
-- track-record roll-ups (capital-weighted multiple & IRR), so reconciliation
-- precision matters.
--
-- Decimal(20, 2) covers values up to 999,999,999,999,999,999.99. The USING
-- clause casts any existing value; NULLs pass through. PG rewrites each table
-- once (sub-second at single-tenant operator scale).
--
-- NOTE: `prisma migrate dev` also emits a spurious
--   DROP INDEX "DocumentEmbedding_embedding_hnsw_idx";
-- because Prisma 5 cannot represent the pgvector HNSW index on the
-- Unsupported("vector(...)") column. That DROP is intentionally omitted (the
-- index must survive) — the CI drift guard strips the same false-positive.

ALTER TABLE "Sponsor"
  ALTER COLUMN "aumKrw" TYPE NUMERIC(20, 2) USING "aumKrw"::NUMERIC(20, 2);

ALTER TABLE "SponsorPriorDeal"
  ALTER COLUMN "equityKrw" TYPE NUMERIC(20, 2) USING "equityKrw"::NUMERIC(20, 2);
