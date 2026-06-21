-- CreateTable
CREATE TABLE "FinancialNote" (
    "id" TEXT NOT NULL,
    "fundId" TEXT,
    "assetId" TEXT,
    "noteKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FinancialNote_fundId_orderIndex_idx" ON "FinancialNote"("fundId", "orderIndex");

-- CreateIndex
CREATE INDEX "FinancialNote_assetId_orderIndex_idx" ON "FinancialNote"("assetId", "orderIndex");

-- AddForeignKey
ALTER TABLE "FinancialNote" ADD CONSTRAINT "FinancialNote_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialNote" ADD CONSTRAINT "FinancialNote_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

