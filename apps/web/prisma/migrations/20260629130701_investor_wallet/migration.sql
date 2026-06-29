-- AlterTable
-- Add the optional investor wallet used to resolve KYC status server-side
-- (Investor.wallet -> KycRecord.wallet). Nullable: wallet-less investors keep
-- the legacy provided-status path.
ALTER TABLE "Investor" ADD COLUMN "wallet" TEXT;

-- NOTE: `prisma migrate dev` also emitted a spurious
-- `DROP INDEX "DocumentEmbedding_embedding_hnsw_idx"` because the pgvector HNSW
-- index sits on an Unsupported("vector(...)") column Prisma can't model. That
-- DROP is intentionally omitted here (same convention as
-- 20260603040607_add_screening_wallet / 20260618000000_nav_portfolio_decimal) so
-- the vector index is preserved.
