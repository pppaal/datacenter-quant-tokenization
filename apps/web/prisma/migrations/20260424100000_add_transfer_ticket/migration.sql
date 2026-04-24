-- CreateTable
CREATE TABLE "TransferTicket" (
    "id" TEXT NOT NULL,
    "tokenizedAssetId" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "transferAgentAddress" TEXT NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "tokenAddress" TEXT NOT NULL,
    "sellerAddress" TEXT NOT NULL,
    "buyerAddress" TEXT NOT NULL,
    "shareAmount" TEXT NOT NULL,
    "quotePrice" TEXT NOT NULL,
    "quoteAssetSymbol" TEXT NOT NULL,
    "rfqRef" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3),
    "openedBy" TEXT NOT NULL,
    "decidedBy" TEXT,
    "openedTxHash" TEXT,
    "decidedTxHash" TEXT,
    "settledTxHash" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransferTicket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TransferTicket_tokenizedAssetId_ticketId_key" ON "TransferTicket"("tokenizedAssetId", "ticketId");

-- CreateIndex
CREATE INDEX "TransferTicket_status_createdAt_idx" ON "TransferTicket"("status", "createdAt");

-- CreateIndex
CREATE INDEX "TransferTicket_sellerAddress_idx" ON "TransferTicket"("sellerAddress");

-- CreateIndex
CREATE INDEX "TransferTicket_buyerAddress_idx" ON "TransferTicket"("buyerAddress");
