-- Persist the balance-sheet liquidity + cash-flow figures parsed at intake
-- (previously dropped on persist), so current ratio / OCF-to-debt / near-term
-- maturity coverage can be recomputed and displayed.
--
-- NOTE: `prisma migrate dev` also emits a spurious
--   DROP INDEX "DocumentEmbedding_embedding_hnsw_idx";
-- because Prisma 5 cannot represent the pgvector HNSW index on the
-- Unsupported("vector(...)") column. That DROP is intentionally omitted here
-- (the index is created in 20260429150000 and must survive) — the CI drift
-- guard strips the same false-positive.

-- AlterTable
ALTER TABLE "FinancialStatement" ADD COLUMN     "capexKrw" DECIMAL(20,2),
ADD COLUMN     "currentAssetsKrw" DECIMAL(20,2),
ADD COLUMN     "currentDebtMaturitiesKrw" DECIMAL(20,2),
ADD COLUMN     "currentLiabilitiesKrw" DECIMAL(20,2),
ADD COLUMN     "operatingCashFlowKrw" DECIMAL(20,2);
