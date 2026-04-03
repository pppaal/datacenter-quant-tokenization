CREATE TYPE "ResearchSyncTriggerType" AS ENUM ('WORKSPACE_REFRESH', 'SCHEDULED', 'MANUAL');

CREATE TABLE "ResearchSyncRun" (
  "id" TEXT NOT NULL,
  "triggerType" "ResearchSyncTriggerType" NOT NULL,
  "statusLabel" TEXT NOT NULL DEFAULT 'RUNNING',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "latestOfficialSyncAt" TIMESTAMP(3),
  "latestAssetSyncAt" TIMESTAMP(3),
  "officialSourceCount" INTEGER NOT NULL DEFAULT 0,
  "assetDossierCount" INTEGER NOT NULL DEFAULT 0,
  "staleOfficialSourceCount" INTEGER NOT NULL DEFAULT 0,
  "staleAssetDossierCount" INTEGER NOT NULL DEFAULT 0,
  "coverageTaskCount" INTEGER NOT NULL DEFAULT 0,
  "refreshedByActor" TEXT,
  "errorSummary" TEXT,
  "metadata" JSONB,
  CONSTRAINT "ResearchSyncRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ResearchSyncRun_startedAt_idx" ON "ResearchSyncRun"("startedAt");
CREATE INDEX "ResearchSyncRun_statusLabel_startedAt_idx" ON "ResearchSyncRun"("statusLabel", "startedAt");
CREATE INDEX "ResearchSyncRun_triggerType_startedAt_idx" ON "ResearchSyncRun"("triggerType", "startedAt");
