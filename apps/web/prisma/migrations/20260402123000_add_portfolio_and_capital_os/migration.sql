CREATE TYPE "PortfolioAssetStatus" AS ENUM ('ACTIVE', 'WATCHLIST', 'EXITING', 'EXITED');
CREATE TYPE "CovenantStatus" AS ENUM ('PASS', 'WATCH', 'BREACH');
CREATE TYPE "CapitalCallStatus" AS ENUM ('PLANNED', 'ISSUED', 'FUNDED', 'CANCELLED');
CREATE TYPE "DistributionStatus" AS ENUM ('PLANNED', 'ISSUED', 'PAID', 'CANCELLED');
CREATE TYPE "VehicleType" AS ENUM ('FUND', 'SMA', 'JV', 'SPV');
CREATE TYPE "InvestorReportType" AS ENUM ('QUARTERLY_UPDATE', 'CAPITAL_ACCOUNT', 'DDQ_RESPONSE', 'OTHER');

CREATE TABLE "Portfolio" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "strategy" TEXT,
  "baseCurrency" TEXT NOT NULL DEFAULT 'KRW',
  "thesis" TEXT,
  "market" TEXT NOT NULL DEFAULT 'KR',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Portfolio_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Portfolio_code_key" ON "Portfolio"("code");
CREATE INDEX "Portfolio_market_strategy_idx" ON "Portfolio"("market", "strategy");

CREATE TABLE "PortfolioAsset" (
  "id" TEXT NOT NULL,
  "portfolioId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "status" "PortfolioAssetStatus" NOT NULL DEFAULT 'ACTIVE',
  "acquisitionDate" TIMESTAMP(3),
  "acquisitionCostKrw" DOUBLE PRECISION,
  "currentHoldValueKrw" DOUBLE PRECISION,
  "ownershipPct" DOUBLE PRECISION,
  "holdPeriodYears" DOUBLE PRECISION,
  "assetManager" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PortfolioAsset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PortfolioAsset_portfolioId_assetId_key" ON "PortfolioAsset"("portfolioId", "assetId");
CREATE INDEX "PortfolioAsset_status_updatedAt_idx" ON "PortfolioAsset"("status", "updatedAt");

CREATE TABLE "BusinessPlan" (
  "id" TEXT NOT NULL,
  "portfolioAssetId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "executiveSummary" TEXT,
  "holdStrategy" TEXT,
  "leasingPlan" TEXT,
  "capexPlan" TEXT,
  "financingPlan" TEXT,
  "dispositionPlan" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BusinessPlan_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BusinessPlan_portfolioAssetId_updatedAt_idx" ON "BusinessPlan"("portfolioAssetId", "updatedAt");

CREATE TABLE "MonthlyAssetKpi" (
  "id" TEXT NOT NULL,
  "portfolioAssetId" TEXT NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "occupancyPct" DOUBLE PRECISION,
  "leasedAreaSqm" DOUBLE PRECISION,
  "passingRentKrwPerSqmMonth" DOUBLE PRECISION,
  "marketRentKrwPerSqmMonth" DOUBLE PRECISION,
  "effectiveRentKrwPerSqmMonth" DOUBLE PRECISION,
  "noiKrw" DOUBLE PRECISION,
  "opexKrw" DOUBLE PRECISION,
  "capexKrw" DOUBLE PRECISION,
  "debtOutstandingKrw" DOUBLE PRECISION,
  "debtServiceCoverage" DOUBLE PRECISION,
  "ltvPct" DOUBLE PRECISION,
  "navKrw" DOUBLE PRECISION,
  "cashBalanceKrw" DOUBLE PRECISION,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MonthlyAssetKpi_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MonthlyAssetKpi_portfolioAssetId_periodStart_key" ON "MonthlyAssetKpi"("portfolioAssetId", "periodStart");
CREATE INDEX "MonthlyAssetKpi_portfolioAssetId_periodStart_idx" ON "MonthlyAssetKpi"("portfolioAssetId", "periodStart");

CREATE TABLE "LeaseRollSnapshot" (
  "id" TEXT NOT NULL,
  "portfolioAssetId" TEXT NOT NULL,
  "asOfDate" TIMESTAMP(3) NOT NULL,
  "next12MonthsExpiringPct" DOUBLE PRECISION,
  "next24MonthsExpiringPct" DOUBLE PRECISION,
  "weightedAverageLeaseTermYears" DOUBLE PRECISION,
  "passingRentKrwPerSqmMonth" DOUBLE PRECISION,
  "marketRentKrwPerSqmMonth" DOUBLE PRECISION,
  "occupancyPct" DOUBLE PRECISION,
  "watchlistSummary" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeaseRollSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LeaseRollSnapshot_portfolioAssetId_asOfDate_key" ON "LeaseRollSnapshot"("portfolioAssetId", "asOfDate");
CREATE INDEX "LeaseRollSnapshot_portfolioAssetId_asOfDate_idx" ON "LeaseRollSnapshot"("portfolioAssetId", "asOfDate");

CREATE TABLE "Budget" (
  "id" TEXT NOT NULL,
  "portfolioAssetId" TEXT NOT NULL,
  "fiscalYear" INTEGER NOT NULL,
  "label" TEXT NOT NULL,
  "approvedAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Budget_portfolioAssetId_fiscalYear_key" ON "Budget"("portfolioAssetId", "fiscalYear");
CREATE INDEX "Budget_portfolioAssetId_fiscalYear_idx" ON "Budget"("portfolioAssetId", "fiscalYear");

CREATE TABLE "BudgetLineItem" (
  "id" TEXT NOT NULL,
  "budgetId" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "annualBudgetKrw" DOUBLE PRECISION NOT NULL,
  "ytdActualKrw" DOUBLE PRECISION,
  "varianceKrw" DOUBLE PRECISION,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BudgetLineItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BudgetLineItem_budgetId_category_idx" ON "BudgetLineItem"("budgetId", "category");

CREATE TABLE "CapexProject" (
  "id" TEXT NOT NULL,
  "portfolioAssetId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" TEXT,
  "statusLabel" TEXT NOT NULL DEFAULT 'PLANNED',
  "budgetKrw" DOUBLE PRECISION,
  "approvedBudgetKrw" DOUBLE PRECISION,
  "spentToDateKrw" DOUBLE PRECISION,
  "targetCompletionDate" TIMESTAMP(3),
  "actualCompletionDate" TIMESTAMP(3),
  "summary" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CapexProject_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CapexProject_portfolioAssetId_statusLabel_targetCompletionDate_idx" ON "CapexProject"("portfolioAssetId", "statusLabel", "targetCompletionDate");

CREATE TABLE "CovenantTest" (
  "id" TEXT NOT NULL,
  "portfolioAssetId" TEXT NOT NULL,
  "debtFacilityId" TEXT,
  "asOfDate" TIMESTAMP(3) NOT NULL,
  "testName" TEXT NOT NULL,
  "thresholdValue" DOUBLE PRECISION,
  "actualValue" DOUBLE PRECISION,
  "unit" TEXT,
  "status" "CovenantStatus" NOT NULL DEFAULT 'PASS',
  "cureNotes" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CovenantTest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CovenantTest_portfolioAssetId_asOfDate_status_idx" ON "CovenantTest"("portfolioAssetId", "asOfDate", "status");
CREATE INDEX "CovenantTest_debtFacilityId_asOfDate_idx" ON "CovenantTest"("debtFacilityId", "asOfDate");

CREATE TABLE "ExitCase" (
  "id" TEXT NOT NULL,
  "portfolioAssetId" TEXT NOT NULL,
  "caseLabel" TEXT NOT NULL,
  "statusLabel" TEXT NOT NULL DEFAULT 'ACTIVE',
  "underwritingValueKrw" DOUBLE PRECISION,
  "targetExitDate" TIMESTAMP(3),
  "targetCapRatePct" DOUBLE PRECISION,
  "targetIrrPct" DOUBLE PRECISION,
  "probabilityPct" DOUBLE PRECISION,
  "buyerUniverse" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExitCase_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ExitCase_portfolioAssetId_statusLabel_targetExitDate_idx" ON "ExitCase"("portfolioAssetId", "statusLabel", "targetExitDate");

CREATE TABLE "Fund" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "strategy" TEXT,
  "baseCurrency" TEXT NOT NULL DEFAULT 'KRW',
  "targetSizeKrw" DOUBLE PRECISION,
  "committedCapitalKrw" DOUBLE PRECISION,
  "investedCapitalKrw" DOUBLE PRECISION,
  "dryPowderKrw" DOUBLE PRECISION,
  "vintageYear" INTEGER,
  "thesis" TEXT,
  "portfolioId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Fund_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Fund_code_key" ON "Fund"("code");
CREATE INDEX "Fund_strategy_vintageYear_idx" ON "Fund"("strategy", "vintageYear");

CREATE TABLE "Vehicle" (
  "id" TEXT NOT NULL,
  "fundId" TEXT,
  "name" TEXT NOT NULL,
  "vehicleType" "VehicleType" NOT NULL DEFAULT 'FUND',
  "jurisdiction" TEXT,
  "assetClassFocus" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Vehicle_fundId_vehicleType_idx" ON "Vehicle"("fundId", "vehicleType");

CREATE TABLE "Mandate" (
  "id" TEXT NOT NULL,
  "fundId" TEXT,
  "vehicleId" TEXT,
  "title" TEXT NOT NULL,
  "investorName" TEXT,
  "strategy" TEXT,
  "targetAumKrw" DOUBLE PRECISION,
  "statusLabel" TEXT NOT NULL DEFAULT 'ACTIVE',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Mandate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Mandate_fundId_statusLabel_idx" ON "Mandate"("fundId", "statusLabel");
CREATE INDEX "Mandate_vehicleId_statusLabel_idx" ON "Mandate"("vehicleId", "statusLabel");

CREATE TABLE "Investor" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "investorType" TEXT,
  "domicile" TEXT,
  "contactName" TEXT,
  "contactEmail" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Investor_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Investor_code_key" ON "Investor"("code");
CREATE INDEX "Investor_investorType_domicile_idx" ON "Investor"("investorType", "domicile");

CREATE TABLE "Commitment" (
  "id" TEXT NOT NULL,
  "fundId" TEXT NOT NULL,
  "vehicleId" TEXT,
  "investorId" TEXT NOT NULL,
  "commitmentKrw" DOUBLE PRECISION NOT NULL,
  "calledKrw" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "distributedKrw" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "recallableKrw" DOUBLE PRECISION,
  "signedAt" TIMESTAMP(3),
  "statusLabel" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Commitment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Commitment_fundId_investorId_vehicleId_key" ON "Commitment"("fundId", "investorId", "vehicleId");
CREATE INDEX "Commitment_fundId_statusLabel_idx" ON "Commitment"("fundId", "statusLabel");
CREATE INDEX "Commitment_investorId_statusLabel_idx" ON "Commitment"("investorId", "statusLabel");

CREATE TABLE "CapitalCall" (
  "id" TEXT NOT NULL,
  "fundId" TEXT NOT NULL,
  "vehicleId" TEXT,
  "callDate" TIMESTAMP(3) NOT NULL,
  "dueDate" TIMESTAMP(3),
  "amountKrw" DOUBLE PRECISION NOT NULL,
  "purpose" TEXT,
  "status" "CapitalCallStatus" NOT NULL DEFAULT 'PLANNED',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CapitalCall_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CapitalCall_fundId_callDate_status_idx" ON "CapitalCall"("fundId", "callDate", "status");

CREATE TABLE "Distribution" (
  "id" TEXT NOT NULL,
  "fundId" TEXT NOT NULL,
  "vehicleId" TEXT,
  "distributionDate" TIMESTAMP(3) NOT NULL,
  "amountKrw" DOUBLE PRECISION NOT NULL,
  "purpose" TEXT,
  "status" "DistributionStatus" NOT NULL DEFAULT 'PLANNED',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Distribution_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Distribution_fundId_distributionDate_status_idx" ON "Distribution"("fundId", "distributionDate", "status");

CREATE TABLE "InvestorReport" (
  "id" TEXT NOT NULL,
  "fundId" TEXT NOT NULL,
  "investorId" TEXT,
  "reportType" "InvestorReportType" NOT NULL DEFAULT 'QUARTERLY_UPDATE',
  "title" TEXT NOT NULL,
  "periodEnd" TIMESTAMP(3),
  "publishedAt" TIMESTAMP(3),
  "storagePath" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InvestorReport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InvestorReport_fundId_reportType_periodEnd_idx" ON "InvestorReport"("fundId", "reportType", "periodEnd");
CREATE INDEX "InvestorReport_investorId_reportType_periodEnd_idx" ON "InvestorReport"("investorId", "reportType", "periodEnd");

CREATE TABLE "DdqResponse" (
  "id" TEXT NOT NULL,
  "fundId" TEXT,
  "investorId" TEXT,
  "title" TEXT NOT NULL,
  "question" TEXT NOT NULL,
  "answer" TEXT,
  "statusLabel" TEXT NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DdqResponse_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DdqResponse_fundId_statusLabel_idx" ON "DdqResponse"("fundId", "statusLabel");
CREATE INDEX "DdqResponse_investorId_statusLabel_idx" ON "DdqResponse"("investorId", "statusLabel");

ALTER TABLE "PortfolioAsset" ADD CONSTRAINT "PortfolioAsset_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PortfolioAsset" ADD CONSTRAINT "PortfolioAsset_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BusinessPlan" ADD CONSTRAINT "BusinessPlan_portfolioAssetId_fkey" FOREIGN KEY ("portfolioAssetId") REFERENCES "PortfolioAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MonthlyAssetKpi" ADD CONSTRAINT "MonthlyAssetKpi_portfolioAssetId_fkey" FOREIGN KEY ("portfolioAssetId") REFERENCES "PortfolioAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeaseRollSnapshot" ADD CONSTRAINT "LeaseRollSnapshot_portfolioAssetId_fkey" FOREIGN KEY ("portfolioAssetId") REFERENCES "PortfolioAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_portfolioAssetId_fkey" FOREIGN KEY ("portfolioAssetId") REFERENCES "PortfolioAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BudgetLineItem" ADD CONSTRAINT "BudgetLineItem_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CapexProject" ADD CONSTRAINT "CapexProject_portfolioAssetId_fkey" FOREIGN KEY ("portfolioAssetId") REFERENCES "PortfolioAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CovenantTest" ADD CONSTRAINT "CovenantTest_portfolioAssetId_fkey" FOREIGN KEY ("portfolioAssetId") REFERENCES "PortfolioAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CovenantTest" ADD CONSTRAINT "CovenantTest_debtFacilityId_fkey" FOREIGN KEY ("debtFacilityId") REFERENCES "DebtFacility"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ExitCase" ADD CONSTRAINT "ExitCase_portfolioAssetId_fkey" FOREIGN KEY ("portfolioAssetId") REFERENCES "PortfolioAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Fund" ADD CONSTRAINT "Fund_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Mandate" ADD CONSTRAINT "Mandate_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Mandate" ADD CONSTRAINT "Mandate_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Commitment" ADD CONSTRAINT "Commitment_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Commitment" ADD CONSTRAINT "Commitment_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Commitment" ADD CONSTRAINT "Commitment_investorId_fkey" FOREIGN KEY ("investorId") REFERENCES "Investor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CapitalCall" ADD CONSTRAINT "CapitalCall_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CapitalCall" ADD CONSTRAINT "CapitalCall_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Distribution" ADD CONSTRAINT "Distribution_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Distribution" ADD CONSTRAINT "Distribution_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InvestorReport" ADD CONSTRAINT "InvestorReport_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InvestorReport" ADD CONSTRAINT "InvestorReport_investorId_fkey" FOREIGN KEY ("investorId") REFERENCES "Investor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DdqResponse" ADD CONSTRAINT "DdqResponse_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DdqResponse" ADD CONSTRAINT "DdqResponse_investorId_fkey" FOREIGN KEY ("investorId") REFERENCES "Investor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
