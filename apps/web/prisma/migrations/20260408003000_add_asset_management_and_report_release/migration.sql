DO $$
BEGIN
  CREATE TYPE "InvestorReportReleaseStatus" AS ENUM ('DRAFT', 'INTERNAL_REVIEW', 'READY', 'RELEASED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE "AssetManagementInitiative" (
  "id" TEXT NOT NULL,
  "portfolioAssetId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "category" TEXT,
  "status" "TaskStatus" NOT NULL DEFAULT 'OPEN',
  "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
  "ownerName" TEXT,
  "targetDate" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "summary" TEXT,
  "blockerSummary" TEXT,
  "nextStep" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AssetManagementInitiative_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "InvestorReport"
  ADD COLUMN "releaseStatus" "InvestorReportReleaseStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "draftSummary" TEXT,
  ADD COLUMN "reviewNotes" TEXT,
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "reviewedById" TEXT,
  ADD COLUMN "releasedById" TEXT;

UPDATE "InvestorReport"
SET "releaseStatus" = CASE
  WHEN "publishedAt" IS NOT NULL THEN 'RELEASED'::"InvestorReportReleaseStatus"
  ELSE 'DRAFT'::"InvestorReportReleaseStatus"
END;

CREATE INDEX "AssetManagementInitiative_portfolioAssetId_status_priority_idx"
  ON "AssetManagementInitiative"("portfolioAssetId", "status", "priority");

CREATE INDEX "AssetManagementInitiative_targetDate_status_idx"
  ON "AssetManagementInitiative"("targetDate", "status");

CREATE INDEX "InvestorReport_fundId_releaseStatus_periodEnd_idx"
  ON "InvestorReport"("fundId", "releaseStatus", "periodEnd");

ALTER TABLE "AssetManagementInitiative"
  ADD CONSTRAINT "AssetManagementInitiative_portfolioAssetId_fkey"
  FOREIGN KEY ("portfolioAssetId") REFERENCES "PortfolioAsset"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InvestorReport"
  ADD CONSTRAINT "InvestorReport_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InvestorReport"
  ADD CONSTRAINT "InvestorReport_releasedById_fkey"
  FOREIGN KEY ("releasedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
