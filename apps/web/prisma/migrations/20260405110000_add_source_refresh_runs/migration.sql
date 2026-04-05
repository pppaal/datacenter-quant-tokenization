CREATE TYPE "SourceRefreshTriggerType" AS ENUM ('MANUAL', 'SCHEDULED');

CREATE TABLE "SourceRefreshRun" (
    "id" TEXT NOT NULL,
    "triggerType" "SourceRefreshTriggerType" NOT NULL,
    "statusLabel" TEXT NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "staleThresholdHours" INTEGER NOT NULL DEFAULT 24,
    "batchSize" INTEGER NOT NULL DEFAULT 0,
    "sourceSystemCount" INTEGER NOT NULL DEFAULT 0,
    "staleSourceSystemCount" INTEGER NOT NULL DEFAULT 0,
    "assetCandidateCount" INTEGER NOT NULL DEFAULT 0,
    "refreshedAssetCount" INTEGER NOT NULL DEFAULT 0,
    "failedAssetCount" INTEGER NOT NULL DEFAULT 0,
    "refreshedByActor" TEXT,
    "errorSummary" TEXT,
    "metadata" JSONB,

    CONSTRAINT "SourceRefreshRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SourceRefreshRun_startedAt_idx" ON "SourceRefreshRun"("startedAt");
CREATE INDEX "SourceRefreshRun_statusLabel_startedAt_idx" ON "SourceRefreshRun"("statusLabel", "startedAt");
CREATE INDEX "SourceRefreshRun_triggerType_startedAt_idx" ON "SourceRefreshRun"("triggerType", "startedAt");
