-- Convert the NAV / portfolio money columns from Float (double precision) to
-- Decimal(20, 2). Mirrors 20260603042614_capital_accounts_decimal and
-- 20260429160000_financial_statement_decimal: Float8 silently loses precision
-- beyond ~10^15, and these are reconciliation-critical roll-up money columns —
-- they feed fund NAV, the equity waterfall, realized-outcome and portfolio
-- reporting. Ratio/percentage columns on the same tables (ownershipPct, ltvPct,
-- debtServiceCoverage, per-sqm rents) stay Float by design.
--
-- Decimal(20, 2) covers values up to 999,999,999,999,999,999.99. The USING clause
-- casts existing values; NULLs pass through. PG rewrites each table once.
--
-- NOTE: `prisma migrate dev` also emits a spurious
--   DROP INDEX "DocumentEmbedding_embedding_hnsw_idx";
-- (Prisma 5 cannot represent the pgvector HNSW index on the Unsupported(
-- "vector(...)") column). That DROP is intentionally omitted — the CI drift
-- guard strips the same false-positive.

ALTER TABLE "PortfolioAsset"
  ALTER COLUMN "acquisitionCostKrw"  TYPE NUMERIC(20, 2) USING "acquisitionCostKrw"::NUMERIC(20, 2),
  ALTER COLUMN "currentHoldValueKrw" TYPE NUMERIC(20, 2) USING "currentHoldValueKrw"::NUMERIC(20, 2);

ALTER TABLE "MonthlyAssetKpi"
  ALTER COLUMN "noiKrw"             TYPE NUMERIC(20, 2) USING "noiKrw"::NUMERIC(20, 2),
  ALTER COLUMN "opexKrw"            TYPE NUMERIC(20, 2) USING "opexKrw"::NUMERIC(20, 2),
  ALTER COLUMN "capexKrw"           TYPE NUMERIC(20, 2) USING "capexKrw"::NUMERIC(20, 2),
  ALTER COLUMN "debtOutstandingKrw" TYPE NUMERIC(20, 2) USING "debtOutstandingKrw"::NUMERIC(20, 2),
  ALTER COLUMN "navKrw"             TYPE NUMERIC(20, 2) USING "navKrw"::NUMERIC(20, 2),
  ALTER COLUMN "cashBalanceKrw"     TYPE NUMERIC(20, 2) USING "cashBalanceKrw"::NUMERIC(20, 2);
