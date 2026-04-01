CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "actorIdentifier" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "assetId" TEXT,
    "requestPath" TEXT,
    "requestMethod" TEXT,
    "ipAddress" TEXT,
    "statusLabel" TEXT NOT NULL DEFAULT 'SUCCESS',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuditEvent_createdAt_idx" ON "AuditEvent"("createdAt");
CREATE INDEX "AuditEvent_actorIdentifier_createdAt_idx" ON "AuditEvent"("actorIdentifier", "createdAt");
CREATE INDEX "AuditEvent_entityType_entityId_createdAt_idx" ON "AuditEvent"("entityType", "entityId", "createdAt");
CREATE INDEX "AuditEvent_assetId_createdAt_idx" ON "AuditEvent"("assetId", "createdAt");
