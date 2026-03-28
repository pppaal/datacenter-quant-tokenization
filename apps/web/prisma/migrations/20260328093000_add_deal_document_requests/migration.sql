CREATE TYPE "DealRequestStatus" AS ENUM ('REQUESTED', 'RECEIVED', 'WAIVED');

CREATE TABLE "DealDocumentRequest" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "counterpartyId" TEXT,
    "documentId" TEXT,
    "title" TEXT NOT NULL,
    "category" TEXT,
    "status" "DealRequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "dueDate" TIMESTAMP(3),
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealDocumentRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DealDocumentRequest_dealId_status_dueDate_idx" ON "DealDocumentRequest"("dealId", "status", "dueDate");
CREATE INDEX "DealDocumentRequest_counterpartyId_createdAt_idx" ON "DealDocumentRequest"("counterpartyId", "createdAt");
CREATE INDEX "DealDocumentRequest_documentId_createdAt_idx" ON "DealDocumentRequest"("documentId", "createdAt");

ALTER TABLE "DealDocumentRequest"
ADD CONSTRAINT "DealDocumentRequest_dealId_fkey"
FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DealDocumentRequest"
ADD CONSTRAINT "DealDocumentRequest_counterpartyId_fkey"
FOREIGN KEY ("counterpartyId") REFERENCES "Counterparty"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DealDocumentRequest"
ADD CONSTRAINT "DealDocumentRequest_documentId_fkey"
FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;
