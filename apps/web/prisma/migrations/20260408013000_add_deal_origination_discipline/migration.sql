CREATE TYPE "DealOriginationSource" AS ENUM (
  'BROKERED',
  'DIRECT_OWNER',
  'LENDER_CHANNEL',
  'ADVISOR',
  'PROPRIETARY',
  'INBOUND'
);

CREATE TYPE "DealLossReason" AS ENUM (
  'PRICE',
  'EXECUTION',
  'COMPETITION',
  'TIMING',
  'FINANCING',
  'IC_DECLINE',
  'STRATEGY',
  'OTHER'
);

CREATE TYPE "RelationshipCoverageStatus" AS ENUM (
  'PRIMARY',
  'BACKUP',
  'PASSIVE'
);

ALTER TABLE "Counterparty"
ADD COLUMN "coverageOwner" TEXT,
ADD COLUMN "coverageStatus" "RelationshipCoverageStatus" NOT NULL DEFAULT 'PASSIVE',
ADD COLUMN "lastContactAt" TIMESTAMP(3);

ALTER TABLE "Deal"
ADD COLUMN "originationSource" "DealOriginationSource",
ADD COLUMN "originSummary" TEXT,
ADD COLUMN "lossReason" "DealLossReason";

CREATE INDEX "Counterparty_dealId_coverageStatus_lastContactAt_idx"
ON "Counterparty"("dealId", "coverageStatus", "lastContactAt");

CREATE INDEX "Deal_originationSource_stage_idx"
ON "Deal"("originationSource", "stage");
