DO $$
BEGIN
  CREATE TYPE "CommitteeMeetingStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'HELD', 'CLOSED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "CommitteePacketStatus" AS ENUM ('DRAFT', 'READY', 'LOCKED', 'APPROVED', 'CONDITIONAL', 'DECLINED', 'RELEASED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "CommitteeDecisionOutcome" AS ENUM ('APPROVED', 'CONDITIONAL', 'DECLINED', 'DEFERRED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE "InvestmentCommitteeMeeting" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "status" "CommitteeMeetingStatus" NOT NULL DEFAULT 'DRAFT',
  "scheduledFor" TIMESTAMP(3),
  "heldAt" TIMESTAMP(3),
  "venueLabel" TEXT,
  "summary" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InvestmentCommitteeMeeting_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InvestmentCommitteePacket" (
  "id" TEXT NOT NULL,
  "meetingId" TEXT,
  "assetId" TEXT,
  "dealId" TEXT,
  "valuationRunId" TEXT,
  "title" TEXT NOT NULL,
  "packetCode" TEXT NOT NULL,
  "status" "CommitteePacketStatus" NOT NULL DEFAULT 'DRAFT',
  "packetFingerprint" TEXT,
  "reportFingerprint" TEXT,
  "reviewPacketFingerprint" TEXT,
  "preparedByLabel" TEXT,
  "scheduledFor" TIMESTAMP(3),
  "lockedAt" TIMESTAMP(3),
  "releasedAt" TIMESTAMP(3),
  "decisionSummary" TEXT,
  "followUpSummary" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InvestmentCommitteePacket_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InvestmentCommitteeDecision" (
  "id" TEXT NOT NULL,
  "packetId" TEXT NOT NULL,
  "outcome" "CommitteeDecisionOutcome" NOT NULL,
  "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decidedByLabel" TEXT,
  "notes" TEXT,
  "followUpActions" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InvestmentCommitteeDecision_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InvestmentCommitteeMeeting_code_key" ON "InvestmentCommitteeMeeting"("code");
CREATE UNIQUE INDEX "InvestmentCommitteePacket_packetCode_key" ON "InvestmentCommitteePacket"("packetCode");
CREATE INDEX "InvestmentCommitteeMeeting_status_scheduledFor_idx" ON "InvestmentCommitteeMeeting"("status", "scheduledFor");
CREATE INDEX "InvestmentCommitteePacket_meetingId_status_scheduledFor_idx" ON "InvestmentCommitteePacket"("meetingId", "status", "scheduledFor");
CREATE INDEX "InvestmentCommitteePacket_assetId_createdAt_idx" ON "InvestmentCommitteePacket"("assetId", "createdAt");
CREATE INDEX "InvestmentCommitteePacket_dealId_createdAt_idx" ON "InvestmentCommitteePacket"("dealId", "createdAt");
CREATE INDEX "InvestmentCommitteePacket_valuationRunId_createdAt_idx" ON "InvestmentCommitteePacket"("valuationRunId", "createdAt");
CREATE INDEX "InvestmentCommitteeDecision_packetId_decidedAt_idx" ON "InvestmentCommitteeDecision"("packetId", "decidedAt");

ALTER TABLE "InvestmentCommitteePacket"
  ADD CONSTRAINT "InvestmentCommitteePacket_meetingId_fkey"
  FOREIGN KEY ("meetingId") REFERENCES "InvestmentCommitteeMeeting"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InvestmentCommitteePacket"
  ADD CONSTRAINT "InvestmentCommitteePacket_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "Asset"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InvestmentCommitteePacket"
  ADD CONSTRAINT "InvestmentCommitteePacket_dealId_fkey"
  FOREIGN KEY ("dealId") REFERENCES "Deal"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InvestmentCommitteePacket"
  ADD CONSTRAINT "InvestmentCommitteePacket_valuationRunId_fkey"
  FOREIGN KEY ("valuationRunId") REFERENCES "ValuationRun"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InvestmentCommitteeDecision"
  ADD CONSTRAINT "InvestmentCommitteeDecision_packetId_fkey"
  FOREIGN KEY ("packetId") REFERENCES "InvestmentCommitteePacket"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
