CREATE TYPE "DealDiligenceWorkstreamType" AS ENUM (
  'LEGAL',
  'TECHNICAL',
  'ENVIRONMENTAL',
  'COMMERCIAL',
  'TAX',
  'INSURANCE',
  'LEASING',
  'FINANCING'
);

CREATE TYPE "DealDiligenceWorkstreamStatus" AS ENUM (
  'NOT_STARTED',
  'IN_PROGRESS',
  'BLOCKED',
  'READY_FOR_SIGNOFF',
  'SIGNED_OFF'
);

CREATE TABLE "DealDiligenceWorkstream" (
  "id" TEXT NOT NULL,
  "dealId" TEXT NOT NULL,
  "workstreamType" "DealDiligenceWorkstreamType" NOT NULL,
  "status" "DealDiligenceWorkstreamStatus" NOT NULL DEFAULT 'NOT_STARTED',
  "ownerLabel" TEXT,
  "advisorName" TEXT,
  "reportTitle" TEXT,
  "requestedAt" TIMESTAMP(3),
  "dueDate" TIMESTAMP(3),
  "signedOffAt" TIMESTAMP(3),
  "signedOffByLabel" TEXT,
  "summary" TEXT,
  "blockerSummary" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DealDiligenceWorkstream_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DealDiligenceWorkstream_dealId_workstreamType_key" ON "DealDiligenceWorkstream"("dealId", "workstreamType");
CREATE INDEX "DealDiligenceWorkstream_dealId_status_dueDate_idx" ON "DealDiligenceWorkstream"("dealId", "status", "dueDate");

ALTER TABLE "DealDiligenceWorkstream"
ADD CONSTRAINT "DealDiligenceWorkstream_dealId_fkey"
FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
