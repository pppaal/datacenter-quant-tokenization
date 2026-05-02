-- Reconcile schema-vs-migration drift on DocumentEmbedding.
--
-- The original pgvector + AI cache migration (20260429140000) created the
-- column as `createdAt`. The schema model in
-- a follow-up commit (8a6523d) renamed it to `indexedAt` to better
-- describe the semantic — these are indexer write timestamps, not
-- entity-creation timestamps. The Prisma client now generates
-- `indexedAt` queries; without this migration they fail at runtime
-- with `column DocumentEmbedding.indexedAt does not exist`.
--
-- The IF EXISTS guard keeps the migration safe to re-apply against
-- environments where the column was already renamed manually.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'DocumentEmbedding'
      AND column_name = 'createdAt'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'DocumentEmbedding'
      AND column_name = 'indexedAt'
  ) THEN
    ALTER TABLE "DocumentEmbedding" RENAME COLUMN "createdAt" TO "indexedAt";
  END IF;
END $$;
