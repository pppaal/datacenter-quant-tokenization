-- Reconciles pre-existing index-NAME drift between the shipped migration
-- chain and schema.prisma. The earlier migrations that created these
-- composite indexes used hand-abbreviated names, while schema.prisma's
-- `@@index([...])` declarations resolve to Prisma's longer auto-generated
-- naming convention. `prisma migrate diff --from-migrations
-- --to-schema-datamodel` therefore reports a set of RenameIndex changes,
-- which trips the `web-ci.static-checks` parity gate
-- (`prisma migrate diff --exit-code`).
--
-- This migration brings the DB index names in line with what schema.prisma
-- expects. It is a PURE RENAME — no columns, types, constraints, or index
-- definitions change. Scope is strictly the six models flagged by the diff:
--   DealFlowEntry, MarketIndicatorSeries, SponsorPriorDeal,
--   TenantDemand, TransactionComp  (and DocumentEmbedding — see note below).
--
-- Per CLAUDE.md we never edit a shipped migration; drift is reconciled in a
-- new, idempotent migration. Every statement uses `ALTER INDEX IF EXISTS`,
-- so it is safe to apply whether the target DB still carries the old index
-- names (bootstrapped from the chain) or already carries the new ones
-- (bootstrapped via `prisma db push` / schema-first). Re-applying is a
-- no-op.
--
-- NOTE on DocumentEmbedding: the `embedding` column is pgvector's
-- vector(1536), declared in schema.prisma as Unsupported(...). The HNSW
-- index `DocumentEmbedding_embedding_hnsw_idx`
-- (20260429150000_add_document_embedding_hnsw_index) is intentional and
-- must NOT be dropped. Prisma 5 cannot represent an `hnsw` index on an
-- Unsupported column in the datamodel, so `migrate diff` will always emit a
-- spurious `DropIndex` for it. That is a known Prisma+pgvector limitation,
-- not real schema drift, and is deliberately NOT reconciled here. This
-- migration does not touch that index.

-- DealFlowEntry --------------------------------------------------------------
ALTER INDEX IF EXISTS "DealFlowEntry_assetclass_observed_idx"
  RENAME TO "DealFlowEntry_assetClass_observedAt_idx";
ALTER INDEX IF EXISTS "DealFlowEntry_market_type_status_idx"
  RENAME TO "DealFlowEntry_market_dealType_status_observedAt_idx";

-- MarketIndicatorSeries ------------------------------------------------------
ALTER INDEX IF EXISTS "MarketIndicatorSeries_market_region_class_tier_idx"
  RENAME TO "MarketIndicatorSeries_market_region_assetClass_assetTier_in_idx";

-- SponsorPriorDeal -----------------------------------------------------------
ALTER INDEX IF EXISTS "SponsorPriorDeal_sponsorId_vintage_idx"
  RENAME TO "SponsorPriorDeal_sponsorId_vintageYear_idx";

-- TenantDemand ---------------------------------------------------------------
ALTER INDEX IF EXISTS "TenantDemand_market_class_status_idx"
  RENAME TO "TenantDemand_market_assetClass_status_observedAt_idx";
ALTER INDEX IF EXISTS "TenantDemand_region_observed_idx"
  RENAME TO "TenantDemand_region_observedAt_idx";

-- TransactionComp ------------------------------------------------------------
ALTER INDEX IF EXISTS "TransactionComp_market_region_class_tier_idx"
  RENAME TO "TransactionComp_market_region_assetClass_assetTier_transact_idx";
