CREATE TYPE "DealStage" AS ENUM (
    'SOURCED',
    'SCREENED',
    'NDA',
    'LOI',
    'DD',
    'IC',
    'CLOSING',
    'ASSET_MANAGEMENT'
);

CREATE TYPE "TaskStatus" AS ENUM (
    'OPEN',
    'IN_PROGRESS',
    'BLOCKED',
    'DONE'
);

CREATE TYPE "TaskPriority" AS ENUM (
    'LOW',
    'MEDIUM',
    'HIGH',
    'URGENT'
);

CREATE TYPE "RiskSeverity" AS ENUM (
    'LOW',
    'MEDIUM',
    'HIGH',
    'CRITICAL'
);

CREATE TYPE "ActivityType" AS ENUM (
    'GENERAL',
    'NOTE',
    'STAGE_CHANGED',
    'NEXT_ACTION',
    'TASK_CREATED',
    'TASK_UPDATED',
    'RISK_CREATED',
    'RISK_UPDATED',
    'COUNTERPARTY_ADDED'
);

ALTER TABLE "Counterparty"
ALTER COLUMN "assetId" DROP NOT NULL,
ADD COLUMN "dealId" TEXT,
ADD COLUMN "company" TEXT,
ADD COLUMN "email" TEXT,
ADD COLUMN "phone" TEXT,
ADD COLUMN "notes" TEXT;

CREATE TABLE "Deal" (
    "id" TEXT NOT NULL,
    "dealCode" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "stage" "DealStage" NOT NULL DEFAULT 'SOURCED',
    "market" TEXT NOT NULL DEFAULT 'KR',
    "city" TEXT,
    "country" TEXT,
    "assetClass" "AssetClass",
    "strategy" TEXT,
    "headline" TEXT,
    "nextAction" TEXT,
    "nextActionAt" TIMESTAMP(3),
    "targetCloseDate" TIMESTAMP(3),
    "sellerGuidanceKrw" DOUBLE PRECISION,
    "bidGuidanceKrw" DOUBLE PRECISION,
    "purchasePriceKrw" DOUBLE PRECISION,
    "statusLabel" TEXT NOT NULL DEFAULT 'ACTIVE',
    "archivedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "closeOutcome" TEXT,
    "closeSummary" TEXT,
    "dealLead" TEXT,
    "assetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "ownerLabel" TEXT,
    "checklistKey" TEXT,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RiskFlag" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "severity" "RiskSeverity" NOT NULL DEFAULT 'MEDIUM',
    "statusLabel" TEXT NOT NULL DEFAULT 'OPEN',
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiskFlag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "counterpartyId" TEXT,
    "activityType" "ActivityType" NOT NULL DEFAULT 'GENERAL',
    "title" TEXT NOT NULL,
    "body" TEXT,
    "stageFrom" "DealStage",
    "stageTo" "DealStage",
    "metadata" JSONB,
    "createdByLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Deal_dealCode_key" ON "Deal"("dealCode");
CREATE UNIQUE INDEX "Deal_slug_key" ON "Deal"("slug");
CREATE INDEX "Deal_stage_targetCloseDate_idx" ON "Deal"("stage", "targetCloseDate");
CREATE INDEX "Deal_market_assetClass_stage_idx" ON "Deal"("market", "assetClass", "stage");

CREATE INDEX "Task_dealId_status_dueDate_idx" ON "Task"("dealId", "status", "dueDate");
CREATE INDEX "Task_dealId_priority_createdAt_idx" ON "Task"("dealId", "priority", "createdAt");

CREATE INDEX "RiskFlag_dealId_isResolved_severity_idx" ON "RiskFlag"("dealId", "isResolved", "severity");

CREATE INDEX "ActivityLog_dealId_createdAt_idx" ON "ActivityLog"("dealId", "createdAt");
CREATE INDEX "ActivityLog_counterpartyId_createdAt_idx" ON "ActivityLog"("counterpartyId", "createdAt");

CREATE INDEX "Counterparty_dealId_role_createdAt_idx" ON "Counterparty"("dealId", "role", "createdAt");

ALTER TABLE "Deal"
ADD CONSTRAINT "Deal_assetId_fkey"
FOREIGN KEY ("assetId") REFERENCES "Asset"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Task"
ADD CONSTRAINT "Task_dealId_fkey"
FOREIGN KEY ("dealId") REFERENCES "Deal"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RiskFlag"
ADD CONSTRAINT "RiskFlag_dealId_fkey"
FOREIGN KEY ("dealId") REFERENCES "Deal"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ActivityLog"
ADD CONSTRAINT "ActivityLog_dealId_fkey"
FOREIGN KEY ("dealId") REFERENCES "Deal"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ActivityLog"
ADD CONSTRAINT "ActivityLog_counterpartyId_fkey"
FOREIGN KEY ("counterpartyId") REFERENCES "Counterparty"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Counterparty"
ADD CONSTRAINT "Counterparty_dealId_fkey"
FOREIGN KEY ("dealId") REFERENCES "Deal"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
