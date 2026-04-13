-- CreateTable
CREATE TABLE "DealDiligenceDeliverable" (
    "id" TEXT NOT NULL,
    "workstreamId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealDiligenceDeliverable_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DealDiligenceDeliverable_workstreamId_documentId_key" ON "DealDiligenceDeliverable"("workstreamId", "documentId");

-- CreateIndex
CREATE INDEX "DealDiligenceDeliverable_documentId_createdAt_idx" ON "DealDiligenceDeliverable"("documentId", "createdAt");

-- AddForeignKey
ALTER TABLE "DealDiligenceDeliverable" ADD CONSTRAINT "DealDiligenceDeliverable_workstreamId_fkey" FOREIGN KEY ("workstreamId") REFERENCES "DealDiligenceWorkstream"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealDiligenceDeliverable" ADD CONSTRAINT "DealDiligenceDeliverable_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
