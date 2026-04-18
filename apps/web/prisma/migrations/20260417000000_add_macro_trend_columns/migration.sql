-- Add trend analysis columns to MacroFactor
ALTER TABLE "MacroFactor" ADD COLUMN "trendDirection" TEXT;
ALTER TABLE "MacroFactor" ADD COLUMN "trendMomentum" DOUBLE PRECISION;
ALTER TABLE "MacroFactor" ADD COLUMN "trendAcceleration" DOUBLE PRECISION;
ALTER TABLE "MacroFactor" ADD COLUMN "anomalyZScore" DOUBLE PRECISION;
ALTER TABLE "MacroFactor" ADD COLUMN "movingAvg3" DOUBLE PRECISION;
ALTER TABLE "MacroFactor" ADD COLUMN "movingAvg6" DOUBLE PRECISION;
ALTER TABLE "MacroFactor" ADD COLUMN "movingAvg12" DOUBLE PRECISION;
