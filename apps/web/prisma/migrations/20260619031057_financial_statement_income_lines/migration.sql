-- Persist operating income (영업이익) and net income (당기순이익) parsed from
-- statements so EBIT-based interest coverage, operating margin, and ROA — and
-- the AAA–CCC credit grade — can be computed from a stored statement.
--
-- NOTE: `prisma migrate dev` also emits a spurious
--   DROP INDEX "DocumentEmbedding_embedding_hnsw_idx";
-- because Prisma 5 cannot represent the pgvector HNSW index on the
-- Unsupported("vector(...)") column. That DROP is intentionally omitted here
-- (the index is created in 20260429150000 and must survive) — the CI drift
-- guard strips the same false-positive.

-- AlterTable
ALTER TABLE "FinancialStatement" ADD COLUMN     "netIncomeKrw" DECIMAL(20,2),
ADD COLUMN     "operatingIncomeKrw" DECIMAL(20,2);
