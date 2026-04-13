CREATE TABLE IF NOT EXISTS "SensitivityRun" (
    "id" TEXT NOT NULL,
    "valuationRunId" TEXT NOT NULL,
    "runType" TEXT NOT NULL DEFAULT 'ONE_WAY',
    "title" TEXT NOT NULL,
    "baselineMetricName" TEXT NOT NULL,
    "baselineMetricValue" DOUBLE PRECISION NOT NULL,
    "summary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SensitivityRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SensitivityPoint" (
    "id" TEXT NOT NULL,
    "sensitivityRunId" TEXT NOT NULL,
    "variableKey" TEXT NOT NULL,
    "variableLabel" TEXT NOT NULL,
    "shockLabel" TEXT NOT NULL,
    "shockValue" DOUBLE PRECISION,
    "metricName" TEXT NOT NULL,
    "metricValue" DOUBLE PRECISION NOT NULL,
    "deltaPct" DOUBLE PRECISION NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SensitivityPoint_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SensitivityRun_valuationRunId_runType_idx"
ON "SensitivityRun"("valuationRunId", "runType");

CREATE INDEX IF NOT EXISTS "SensitivityPoint_sensitivityRunId_sortOrder_idx"
ON "SensitivityPoint"("sensitivityRunId", "sortOrder");

DO $$
BEGIN
    ALTER TABLE "SensitivityRun"
    ADD CONSTRAINT "SensitivityRun_valuationRunId_fkey"
    FOREIGN KEY ("valuationRunId") REFERENCES "ValuationRun"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE "SensitivityPoint"
    ADD CONSTRAINT "SensitivityPoint_sensitivityRunId_fkey"
    FOREIGN KEY ("sensitivityRunId") REFERENCES "SensitivityRun"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
