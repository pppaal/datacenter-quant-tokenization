CREATE TABLE IF NOT EXISTS "FinancialStatement" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "counterpartyId" TEXT NOT NULL,
    "documentVersionId" TEXT,
    "statementType" TEXT NOT NULL,
    "fiscalYear" INTEGER,
    "fiscalPeriod" TEXT,
    "periodEndDate" TIMESTAMP(3),
    "currency" TEXT NOT NULL DEFAULT 'KRW',
    "revenueKrw" DOUBLE PRECISION,
    "ebitdaKrw" DOUBLE PRECISION,
    "cashKrw" DOUBLE PRECISION,
    "totalDebtKrw" DOUBLE PRECISION,
    "totalAssetsKrw" DOUBLE PRECISION,
    "totalEquityKrw" DOUBLE PRECISION,
    "interestExpenseKrw" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialStatement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "FinancialLineItem" (
    "id" TEXT NOT NULL,
    "financialStatementId" TEXT NOT NULL,
    "lineKey" TEXT NOT NULL,
    "lineLabel" TEXT NOT NULL,
    "valueKrw" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialLineItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CreditAssessment" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "counterpartyId" TEXT NOT NULL,
    "financialStatementId" TEXT,
    "documentVersionId" TEXT,
    "assessmentType" TEXT NOT NULL DEFAULT 'COUNTERPARTY_CREDIT',
    "score" DOUBLE PRECISION NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "metrics" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditAssessment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "FinancialStatement_assetId_counterpartyId_createdAt_idx"
ON "FinancialStatement"("assetId", "counterpartyId", "createdAt");

CREATE INDEX IF NOT EXISTS "FinancialStatement_documentVersionId_createdAt_idx"
ON "FinancialStatement"("documentVersionId", "createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "FinancialLineItem_financialStatementId_lineKey_key"
ON "FinancialLineItem"("financialStatementId", "lineKey");

CREATE INDEX IF NOT EXISTS "FinancialLineItem_financialStatementId_lineKey_idx"
ON "FinancialLineItem"("financialStatementId", "lineKey");

CREATE INDEX IF NOT EXISTS "CreditAssessment_assetId_createdAt_idx"
ON "CreditAssessment"("assetId", "createdAt");

CREATE INDEX IF NOT EXISTS "CreditAssessment_counterpartyId_createdAt_idx"
ON "CreditAssessment"("counterpartyId", "createdAt");

CREATE INDEX IF NOT EXISTS "CreditAssessment_documentVersionId_createdAt_idx"
ON "CreditAssessment"("documentVersionId", "createdAt");

DO $$
BEGIN
    ALTER TABLE "FinancialStatement"
    ADD CONSTRAINT "FinancialStatement_assetId_fkey"
    FOREIGN KEY ("assetId") REFERENCES "Asset"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE "FinancialStatement"
    ADD CONSTRAINT "FinancialStatement_counterpartyId_fkey"
    FOREIGN KEY ("counterpartyId") REFERENCES "Counterparty"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE "FinancialStatement"
    ADD CONSTRAINT "FinancialStatement_documentVersionId_fkey"
    FOREIGN KEY ("documentVersionId") REFERENCES "DocumentVersion"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE "FinancialLineItem"
    ADD CONSTRAINT "FinancialLineItem_financialStatementId_fkey"
    FOREIGN KEY ("financialStatementId") REFERENCES "FinancialStatement"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE "CreditAssessment"
    ADD CONSTRAINT "CreditAssessment_assetId_fkey"
    FOREIGN KEY ("assetId") REFERENCES "Asset"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE "CreditAssessment"
    ADD CONSTRAINT "CreditAssessment_counterpartyId_fkey"
    FOREIGN KEY ("counterpartyId") REFERENCES "Counterparty"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE "CreditAssessment"
    ADD CONSTRAINT "CreditAssessment_financialStatementId_fkey"
    FOREIGN KEY ("financialStatementId") REFERENCES "FinancialStatement"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE "CreditAssessment"
    ADD CONSTRAINT "CreditAssessment_documentVersionId_fkey"
    FOREIGN KEY ("documentVersionId") REFERENCES "DocumentVersion"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
