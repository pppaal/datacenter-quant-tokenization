-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "NotificationType" AS ENUM (
        'IC_PACKET_LOCKED',
        'IC_PACKET_DECIDED',
        'IC_PACKET_RELEASED',
        'RESEARCH_APPROVED',
        'DILIGENCE_BLOCKED',
        'SYSTEM'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "NotificationSeverity" AS ENUM (
        'INFO',
        'WARN',
        'CRITICAL'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "Notification" (
    "id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "severity" "NotificationSeverity" NOT NULL DEFAULT 'INFO',
    "title" TEXT NOT NULL,
    "body" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "audienceRole" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Notification_createdAt_idx" ON "Notification"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Notification_readAt_idx" ON "Notification"("readAt");
