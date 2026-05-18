-- Capture transaction receipt metadata alongside the txHash that already
-- exists on OnchainRecord. Without these columns the row says only "we
-- submitted a tx and got a hash"; with them it can answer "did the chain
-- accept it, in which block, and what did it cost?". Used by the operator
-- console to surface gas/cost trends and to reconcile against the events
-- mirrored by the onchain indexer.

ALTER TABLE "OnchainRecord" ADD COLUMN IF NOT EXISTS "blockNumber" BIGINT;
ALTER TABLE "OnchainRecord" ADD COLUMN IF NOT EXISTS "gasUsed" BIGINT;
ALTER TABLE "OnchainRecord" ADD COLUMN IF NOT EXISTS "effectiveGasPrice" TEXT;
ALTER TABLE "OnchainRecord" ADD COLUMN IF NOT EXISTS "receiptStatus" TEXT;
