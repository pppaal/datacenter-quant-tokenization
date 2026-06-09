-- Associate a sanctions screening with an on-chain wallet so the KYC→identity
-- bridge can require a CLEAR screening before whitelisting a token holder.
--
-- NOTE: `prisma migrate dev` also emits a spurious
--   DROP INDEX "DocumentEmbedding_embedding_hnsw_idx";
-- because Prisma 5 cannot represent the pgvector HNSW index on the
-- Unsupported("vector(...)") column. That DROP is intentionally omitted here
-- (the index is created in 20260429150000 and must survive) — the CI drift
-- guard strips the same false-positive.

-- AlterTable
ALTER TABLE "ScreeningResult" ADD COLUMN IF NOT EXISTS "wallet" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ScreeningResult_wallet_screenedAt_idx" ON "ScreeningResult"("wallet", "screenedAt");
