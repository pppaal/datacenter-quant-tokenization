-- CreateIndex
-- Index both OnchainRecord FK columns (rwaProjectId is the @map of
-- readinessProjectId). Looked up by project (per-asset readiness/anchor views)
-- and by document (anchor-status joins); both were sequential scans before.
CREATE INDEX "OnchainRecord_rwaProjectId_idx" ON "OnchainRecord"("rwaProjectId");

CREATE INDEX "OnchainRecord_documentId_idx" ON "OnchainRecord"("documentId");

-- NOTE: `migrate diff` also emitted a spurious
-- `DROP INDEX "DocumentEmbedding_embedding_hnsw_idx"` (pgvector HNSW on an
-- Unsupported("vector(...)") column Prisma can't model). Intentionally omitted,
-- same convention as the other money/wallet migrations, to preserve the index.
