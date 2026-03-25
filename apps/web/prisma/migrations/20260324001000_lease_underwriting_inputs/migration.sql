ALTER TABLE "Lease"
ADD COLUMN "rentFreeMonths" INTEGER,
ADD COLUMN "tenantImprovementKrw" DOUBLE PRECISION,
ADD COLUMN "leasingCommissionKrw" DOUBLE PRECISION,
ADD COLUMN "recoverableOpexRatioPct" DOUBLE PRECISION;
