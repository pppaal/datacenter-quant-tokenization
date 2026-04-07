ALTER TABLE "User"
ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "OpsAlertDelivery" (
  "id" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "destination" TEXT NOT NULL,
  "statusLabel" TEXT NOT NULL DEFAULT 'PENDING',
  "reason" TEXT,
  "actorIdentifier" TEXT,
  "environmentLabel" TEXT,
  "errorMessage" TEXT,
  "payload" JSONB,
  "deliveredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OpsAlertDelivery_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OpsAlertDelivery_createdAt_idx" ON "OpsAlertDelivery"("createdAt");
CREATE INDEX "OpsAlertDelivery_statusLabel_createdAt_idx" ON "OpsAlertDelivery"("statusLabel", "createdAt");
