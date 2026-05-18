-- HNSW ANN index on DocumentEmbedding.embedding for semantic search.
--
-- Why HNSW (not ivfflat):
--   - Document corpus is read-heavy: insert once when a document is
--     uploaded, query repeatedly via the agent's search_corpus tool.
--   - HNSW maintains higher recall than ivfflat at the same query
--     speed, which matters here because a missed passage means the
--     agent falls back to a more expensive web fetch.
--   - HNSW does not require a `lists` tuning parameter that depends on
--     row count, so the index doesn't need re-tuning as the corpus
--     grows from hundreds to tens of thousands of chunks.
--
-- Cost: HNSW takes ~2-3x the disk and memory of the raw vectors and
-- builds slower than ivfflat. For our scale (single-tenant, rarely
-- millions of chunks) that's an acceptable trade.
--
-- Operator class: vector_cosine_ops matches the `<=>` operator used by
-- `semanticSearch()` in lib/services/research/document-indexer.ts. If
-- the search switches to L2 / inner-product later, the index has to be
-- recreated with the matching ops.
--
-- Parameters: m = 16, ef_construction = 64 are pgvector defaults that
-- work well up to ~1M rows. Tune at scale.
--
-- Requires pgvector >= 0.5.0. Supabase, Neon, and RDS Postgres 16 all
-- ship a compatible version. The IF NOT EXISTS guard keeps the
-- migration idempotent against environments that pre-built the index.

CREATE INDEX IF NOT EXISTS "DocumentEmbedding_embedding_hnsw_idx"
  ON "DocumentEmbedding"
  USING hnsw ("embedding" vector_cosine_ops);
