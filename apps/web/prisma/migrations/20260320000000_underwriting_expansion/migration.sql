-- CreateEnum
CREATE TYPE "CapexCategory" AS ENUM ('LAND', 'SHELL_CORE', 'ELECTRICAL', 'MECHANICAL', 'IT_FIT_OUT', 'SOFT_COST', 'CONTINGENCY');

-- CreateEnum
CREATE TYPE "LeaseStatus" AS ENUM ('PIPELINE', 'SIGNED', 'ACTIVE', 'EXPIRED');

-- CreateEnum
CREATE TYPE "DebtFacilityType" AS ENUM ('CONSTRUCTION', 'TERM', 'REVOLVER');

-- CreateEnum
CREATE TYPE "AmortizationProfile" AS ENUM ('INTEREST_ONLY', 'MORTGAGE', 'SCULPTED', 'BULLET');

-- CreateTable
CREATE TABLE "ComparableSet" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "valuationDate" TIMESTAMP(3),
    "calibrationMode" TEXT NOT NULL DEFAULT 'Weighted market calibration',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComparableSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComparableEntry" (
    "id" TEXT NOT NULL,
    "comparableSetId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "assetType" TEXT NOT NULL,
    "stage" "AssetStage",
    "sourceLink" TEXT,
    "powerCapacityMw" DOUBLE PRECISION,
    "grossFloorAreaSqm" DOUBLE PRECISION,
    "occupancyPct" DOUBLE PRECISION,
    "pricePerMwKrw" DOUBLE PRECISION,
    "valuationKrw" DOUBLE PRECISION,
    "monthlyRatePerKwKrw" DOUBLE PRECISION,
    "capRatePct" DOUBLE PRECISION,
    "discountRatePct" DOUBLE PRECISION,
    "weightPct" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComparableEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CapexLineItem" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "category" "CapexCategory" NOT NULL,
    "label" TEXT NOT NULL,
    "amountKrw" DOUBLE PRECISION NOT NULL,
    "spendYear" INTEGER NOT NULL DEFAULT 0,
    "isEmbedded" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CapexLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lease" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "tenantName" TEXT NOT NULL,
    "status" "LeaseStatus" NOT NULL DEFAULT 'PIPELINE',
    "leasedKw" DOUBLE PRECISION NOT NULL,
    "startYear" INTEGER NOT NULL DEFAULT 1,
    "termYears" INTEGER NOT NULL,
    "baseRatePerKwKrw" DOUBLE PRECISION NOT NULL,
    "annualEscalationPct" DOUBLE PRECISION,
    "probabilityPct" DOUBLE PRECISION,
    "renewProbabilityPct" DOUBLE PRECISION,
    "downtimeMonths" INTEGER,
    "fitOutCostKrw" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaseStep" (
    "id" TEXT NOT NULL,
    "leaseId" TEXT NOT NULL,
    "stepOrder" INTEGER NOT NULL,
    "startYear" INTEGER NOT NULL,
    "endYear" INTEGER NOT NULL,
    "ratePerKwKrw" DOUBLE PRECISION NOT NULL,
    "leasedKw" DOUBLE PRECISION,
    "annualEscalationPct" DOUBLE PRECISION,
    "occupancyPct" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaseStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxAssumption" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "acquisitionTaxPct" DOUBLE PRECISION,
    "vatRecoveryPct" DOUBLE PRECISION,
    "propertyTaxPct" DOUBLE PRECISION,
    "insurancePct" DOUBLE PRECISION,
    "corporateTaxPct" DOUBLE PRECISION,
    "withholdingTaxPct" DOUBLE PRECISION,
    "exitTaxPct" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxAssumption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpvStructure" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "legalStructure" TEXT NOT NULL,
    "managementFeePct" DOUBLE PRECISION,
    "performanceFeePct" DOUBLE PRECISION,
    "promoteThresholdPct" DOUBLE PRECISION,
    "promoteSharePct" DOUBLE PRECISION,
    "reserveTargetMonths" DOUBLE PRECISION,
    "distributionWaterfall" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpvStructure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DebtFacility" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "facilityType" "DebtFacilityType" NOT NULL,
    "lenderName" TEXT,
    "commitmentKrw" DOUBLE PRECISION NOT NULL,
    "drawnAmountKrw" DOUBLE PRECISION,
    "interestRatePct" DOUBLE PRECISION NOT NULL,
    "upfrontFeePct" DOUBLE PRECISION,
    "commitmentFeePct" DOUBLE PRECISION,
    "gracePeriodMonths" INTEGER,
    "amortizationTermMonths" INTEGER,
    "amortizationProfile" "AmortizationProfile" NOT NULL DEFAULT 'INTEREST_ONLY',
    "sculptedTargetDscr" DOUBLE PRECISION,
    "balloonPct" DOUBLE PRECISION,
    "reserveMonths" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DebtFacility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DebtDraw" (
    "id" TEXT NOT NULL,
    "debtFacilityId" TEXT NOT NULL,
    "drawYear" INTEGER NOT NULL,
    "drawMonth" INTEGER,
    "amountKrw" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DebtDraw_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ComparableSet_assetId_key" ON "ComparableSet"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "LeaseStep_leaseId_stepOrder_key" ON "LeaseStep"("leaseId", "stepOrder");

-- CreateIndex
CREATE UNIQUE INDEX "TaxAssumption_assetId_key" ON "TaxAssumption"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "SpvStructure_assetId_key" ON "SpvStructure"("assetId");

-- AddForeignKey
ALTER TABLE "ComparableSet" ADD CONSTRAINT "ComparableSet_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComparableEntry" ADD CONSTRAINT "ComparableEntry_comparableSetId_fkey" FOREIGN KEY ("comparableSetId") REFERENCES "ComparableSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapexLineItem" ADD CONSTRAINT "CapexLineItem_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lease" ADD CONSTRAINT "Lease_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaseStep" ADD CONSTRAINT "LeaseStep_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "Lease"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxAssumption" ADD CONSTRAINT "TaxAssumption_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpvStructure" ADD CONSTRAINT "SpvStructure_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtFacility" ADD CONSTRAINT "DebtFacility_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtDraw" ADD CONSTRAINT "DebtDraw_debtFacilityId_fkey" FOREIGN KEY ("debtFacilityId") REFERENCES "DebtFacility"("id") ON DELETE CASCADE ON UPDATE CASCADE;
