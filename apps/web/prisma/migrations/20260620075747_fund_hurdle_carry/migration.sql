-- AlterTable: per-fund promote economics (null = firm-wide default in the engine)
ALTER TABLE "Fund" ADD COLUMN     "carriedInterestPct" DOUBLE PRECISION,
ADD COLUMN     "hurdleRatePct" DOUBLE PRECISION;
