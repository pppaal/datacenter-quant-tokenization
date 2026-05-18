-- Cursor + event mirror tables for the chain → DB indexer.
-- One cursor per (chainId, contractAddress); the indexer polls
-- `getLogs(fromBlock = lastBlock + 1, toBlock = currentBlock)` and records
-- every matched event into OnchainEvent for offline auditing, UI listing,
-- and reconciliation against the per-action records the service layer
-- already writes synchronously.

CREATE TABLE IF NOT EXISTS "OnchainEventCursor" (
    "id" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "contractAddress" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "lastBlock" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnchainEventCursor_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OnchainEventCursor_chainId_contractAddress_key"
    ON "OnchainEventCursor"("chainId", "contractAddress");

CREATE TABLE IF NOT EXISTS "OnchainEvent" (
    "id" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "blockHash" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "contractAddress" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "args" JSONB NOT NULL,
    "indexedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OnchainEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OnchainEvent_chainId_txHash_logIndex_key"
    ON "OnchainEvent"("chainId", "txHash", "logIndex");
CREATE INDEX IF NOT EXISTS "OnchainEvent_chainId_contractAddress_eventName_idx"
    ON "OnchainEvent"("chainId", "contractAddress", "eventName");
CREATE INDEX IF NOT EXISTS "OnchainEvent_chainId_blockNumber_idx"
    ON "OnchainEvent"("chainId", "blockNumber");
