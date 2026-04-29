-- pgvector: enables semantic search over uploaded documents and research
-- snapshots. The agent has been re-fetching primary sources every run
-- because there's no semantic index over the corpus we already extracted.
-- A 1536-dim column matches OpenAI text-embedding-3-small / Anthropic's
-- voyage-3 ranges, both of which the project may use; we don't pin a
-- specific model here.
--
-- AiResponseCache: deterministic LLM-call dedup. Same (model, prompt hash)
-- with TTL — saves both API spend and latency for replayed analyses.
-- The hash is SHA-256 over the canonical request envelope (model + system
-- + messages + tools); collision chance for that is astronomically low.
--
-- IF NOT EXISTS guards keep the migration idempotent against environments
-- where the extension was created out-of-band. Vector indexes (ivfflat /
-- hnsw) are intentionally NOT created here — they need tuning against the
-- actual row count and cost the most when the table is empty. Add them in
-- a follow-up migration once the corpus is sized.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS "DocumentEmbedding" (
    "id"           TEXT NOT NULL,
    "documentId"   TEXT NOT NULL,
    "chunkIndex"   INTEGER NOT NULL,
    "model"        TEXT NOT NULL,
    "embedding"    vector(1536) NOT NULL,
    "text"         TEXT NOT NULL,
    "tokenCount"   INTEGER,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentEmbedding_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DocumentEmbedding_documentId_chunkIndex_model_key"
    ON "DocumentEmbedding"("documentId", "chunkIndex", "model");
CREATE INDEX IF NOT EXISTS "DocumentEmbedding_documentId_idx"
    ON "DocumentEmbedding"("documentId");

CREATE TABLE IF NOT EXISTS "AiResponseCache" (
    "id"           TEXT NOT NULL,
    "promptHash"   TEXT NOT NULL,
    "model"        TEXT NOT NULL,
    "response"     TEXT NOT NULL,
    "inputTokens"  INTEGER,
    "outputTokens" INTEGER,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt"    TIMESTAMP(3) NOT NULL,
    "hitCount"     INTEGER NOT NULL DEFAULT 0,
    "lastHitAt"    TIMESTAMP(3),

    CONSTRAINT "AiResponseCache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AiResponseCache_promptHash_model_key"
    ON "AiResponseCache"("promptHash", "model");
CREATE INDEX IF NOT EXISTS "AiResponseCache_expiresAt_idx"
    ON "AiResponseCache"("expiresAt");
