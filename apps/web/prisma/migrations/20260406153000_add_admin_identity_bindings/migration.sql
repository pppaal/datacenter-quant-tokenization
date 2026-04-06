CREATE TABLE "AdminIdentityBinding" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "userId" TEXT,
    "emailSnapshot" TEXT,
    "identifierSnapshot" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminIdentityBinding_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdminIdentityBinding_provider_subject_key" ON "AdminIdentityBinding"("provider", "subject");
CREATE INDEX "AdminIdentityBinding_userId_updatedAt_idx" ON "AdminIdentityBinding"("userId", "updatedAt");
CREATE INDEX "AdminIdentityBinding_emailSnapshot_updatedAt_idx" ON "AdminIdentityBinding"("emailSnapshot", "updatedAt");

ALTER TABLE "AdminIdentityBinding"
ADD CONSTRAINT "AdminIdentityBinding_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
