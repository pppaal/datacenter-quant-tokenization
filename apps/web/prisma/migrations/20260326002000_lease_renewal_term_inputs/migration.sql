ALTER TABLE "Lease"
ADD COLUMN "renewalRentFreeMonths" INTEGER,
ADD COLUMN "renewalTermYears" INTEGER,
ADD COLUMN "renewalCount" INTEGER;

ALTER TABLE "LeaseStep"
ADD COLUMN "renewalRentFreeMonths" INTEGER,
ADD COLUMN "renewalTermYears" INTEGER,
ADD COLUMN "renewalCount" INTEGER;
