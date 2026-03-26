ALTER TABLE "LeaseStep"
ADD COLUMN "renewProbabilityPct" DOUBLE PRECISION,
ADD COLUMN "rolloverDowntimeMonths" INTEGER,
ADD COLUMN "markToMarketRatePerKwKrw" DOUBLE PRECISION;
