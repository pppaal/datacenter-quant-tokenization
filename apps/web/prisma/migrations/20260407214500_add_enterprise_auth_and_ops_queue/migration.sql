CREATE TYPE "AdminAccessScopeType" AS ENUM ('ASSET', 'DEAL', 'PORTFOLIO', 'FUND');
CREATE TYPE "OpsWorkType" AS ENUM ('OPS_CYCLE', 'SOURCE_REFRESH', 'RESEARCH_SYNC');
CREATE TYPE "OpsWorkStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'DEAD_LETTER');

CREATE TABLE "AdminSession" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "actorIdentifier" TEXT NOT NULL,
  "role" "UserRole" NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'session',
  "subject" TEXT,
  "email" TEXT,
  "sessionVersion" INTEGER,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdminSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdminProvisioningBinding" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "emailSnapshot" TEXT,
  "nameSnapshot" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdminProvisioningBinding_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdminAccessGrant" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "scopeType" "AdminAccessScopeType" NOT NULL,
  "scopeId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdminAccessGrant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OpsWorkItem" (
  "id" TEXT NOT NULL,
  "workType" "OpsWorkType" NOT NULL,
  "status" "OpsWorkStatus" NOT NULL DEFAULT 'QUEUED',
  "actorIdentifier" TEXT,
  "scheduledFor" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "lockedAt" TIMESTAMP(3),
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 3,
  "payload" JSONB,
  "lastError" TEXT,
  "deadLetteredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OpsWorkItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OpsWorkAttempt" (
  "id" TEXT NOT NULL,
  "opsWorkItemId" TEXT NOT NULL,
  "attemptNumber" INTEGER NOT NULL,
  "statusLabel" TEXT NOT NULL DEFAULT 'RUNNING',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "errorMessage" TEXT,
  "metadata" JSONB,
  CONSTRAINT "OpsWorkAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdminProvisioningBinding_provider_externalId_key"
  ON "AdminProvisioningBinding"("provider", "externalId");

CREATE UNIQUE INDEX "AdminAccessGrant_userId_scopeType_scopeId_key"
  ON "AdminAccessGrant"("userId", "scopeType", "scopeId");

CREATE UNIQUE INDEX "OpsWorkAttempt_opsWorkItemId_attemptNumber_key"
  ON "OpsWorkAttempt"("opsWorkItemId", "attemptNumber");

CREATE INDEX "AdminSession_userId_revokedAt_expiresAt_idx"
  ON "AdminSession"("userId", "revokedAt", "expiresAt");

CREATE INDEX "AdminSession_expiresAt_revokedAt_idx"
  ON "AdminSession"("expiresAt", "revokedAt");

CREATE INDEX "AdminProvisioningBinding_userId_updatedAt_idx"
  ON "AdminProvisioningBinding"("userId", "updatedAt");

CREATE INDEX "AdminAccessGrant_scopeType_scopeId_updatedAt_idx"
  ON "AdminAccessGrant"("scopeType", "scopeId", "updatedAt");

CREATE INDEX "OpsWorkItem_status_scheduledFor_createdAt_idx"
  ON "OpsWorkItem"("status", "scheduledFor", "createdAt");

CREATE INDEX "OpsWorkItem_workType_status_createdAt_idx"
  ON "OpsWorkItem"("workType", "status", "createdAt");

CREATE INDEX "OpsWorkAttempt_statusLabel_startedAt_idx"
  ON "OpsWorkAttempt"("statusLabel", "startedAt");

ALTER TABLE "AdminSession"
  ADD CONSTRAINT "AdminSession_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AdminProvisioningBinding"
  ADD CONSTRAINT "AdminProvisioningBinding_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AdminAccessGrant"
  ADD CONSTRAINT "AdminAccessGrant_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OpsWorkAttempt"
  ADD CONSTRAINT "OpsWorkAttempt_opsWorkItemId_fkey"
  FOREIGN KEY ("opsWorkItemId") REFERENCES "OpsWorkItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
