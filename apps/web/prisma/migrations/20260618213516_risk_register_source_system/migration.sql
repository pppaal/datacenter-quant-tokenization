-- Tag risk-register rows by origin so an auto-generate can replace only its
-- own rows. Defaults to 'MANUAL' for existing + operator-entered entries.
--
-- NOTE: `prisma migrate dev` also emits a spurious
--   DROP INDEX "DocumentEmbedding_embedding_hnsw_idx";
-- because Prisma 5 cannot represent the pgvector HNSW index on the
-- Unsupported("vector(...)") column. That DROP is intentionally omitted here
-- (the index is created in 20260429150000 and must survive) — the CI drift
-- guard strips the same false-positive.

-- AlterTable
ALTER TABLE "AssetRiskRegisterEntry" ADD COLUMN     "sourceSystem" TEXT NOT NULL DEFAULT 'MANUAL';
