ALTER TABLE "Lease"
ADD COLUMN "renewalTenantImprovementKrw" DOUBLE PRECISION,
ADD COLUMN "renewalLeasingCommissionKrw" DOUBLE PRECISION;

ALTER TABLE "LeaseStep"
ADD COLUMN "renewalTenantImprovementKrw" DOUBLE PRECISION,
ADD COLUMN "renewalLeasingCommissionKrw" DOUBLE PRECISION;
