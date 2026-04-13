-- CreateEnum
CREATE TYPE "ResearchViewType" AS ENUM ('SOURCE', 'HOUSE');

-- CreateEnum
CREATE TYPE "ResearchApprovalStatus" AS ENUM ('DRAFT', 'APPROVED', 'SUPERSEDED');

-- AlterTable
ALTER TABLE "ResearchSnapshot"
ADD COLUMN     "viewType" "ResearchViewType" NOT NULL DEFAULT 'SOURCE',
ADD COLUMN     "approvalStatus" "ResearchApprovalStatus" NOT NULL DEFAULT 'APPROVED',
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" TEXT,
ADD COLUMN     "supersedesSnapshotId" TEXT;

-- CreateIndex
CREATE INDEX "ResearchSnapshot_viewType_approvalStatus_snapshotDate_idx" ON "ResearchSnapshot"("viewType", "approvalStatus", "snapshotDate");

-- CreateIndex
CREATE INDEX "ResearchSnapshot_approvedById_approvedAt_idx" ON "ResearchSnapshot"("approvedById", "approvedAt");

-- AddForeignKey
ALTER TABLE "ResearchSnapshot" ADD CONSTRAINT "ResearchSnapshot_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchSnapshot" ADD CONSTRAINT "ResearchSnapshot_supersedesSnapshotId_fkey" FOREIGN KEY ("supersedesSnapshotId") REFERENCES "ResearchSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
