DO $$
BEGIN
  CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "EnergySnapshot"
  ADD COLUMN "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "reviewedById" TEXT,
  ADD COLUMN "reviewNotes" TEXT;

ALTER TABLE "PermitSnapshot"
  ADD COLUMN "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "reviewedById" TEXT,
  ADD COLUMN "reviewNotes" TEXT;

ALTER TABLE "OwnershipRecord"
  ADD COLUMN "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "reviewedById" TEXT,
  ADD COLUMN "reviewNotes" TEXT;

ALTER TABLE "EncumbranceRecord"
  ADD COLUMN "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "reviewedById" TEXT,
  ADD COLUMN "reviewNotes" TEXT;

ALTER TABLE "PlanningConstraint"
  ADD COLUMN "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "reviewedById" TEXT,
  ADD COLUMN "reviewNotes" TEXT;

ALTER TABLE "Lease"
  ADD COLUMN "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "reviewedById" TEXT,
  ADD COLUMN "reviewNotes" TEXT;

ALTER TABLE "EnergySnapshot"
  ADD CONSTRAINT "EnergySnapshot_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PermitSnapshot"
  ADD CONSTRAINT "PermitSnapshot_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OwnershipRecord"
  ADD CONSTRAINT "OwnershipRecord_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EncumbranceRecord"
  ADD CONSTRAINT "EncumbranceRecord_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PlanningConstraint"
  ADD CONSTRAINT "PlanningConstraint_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Lease"
  ADD CONSTRAINT "Lease_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
