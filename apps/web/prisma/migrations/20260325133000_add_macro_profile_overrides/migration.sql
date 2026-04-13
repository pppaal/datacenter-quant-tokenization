DO $$
BEGIN
    CREATE TYPE "AssetClass" AS ENUM (
        'OFFICE',
        'INDUSTRIAL',
        'RETAIL',
        'MULTIFAMILY',
        'HOTEL',
        'DATA_CENTER',
        'LAND',
        'MIXED_USE'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE "MacroProfileOverride" (
    "id" TEXT NOT NULL,
    "assetClass" "AssetClass",
    "country" TEXT,
    "submarketPattern" TEXT,
    "label" TEXT NOT NULL,
    "capitalRateMultiplier" DOUBLE PRECISION,
    "liquidityMultiplier" DOUBLE PRECISION,
    "leasingMultiplier" DOUBLE PRECISION,
    "constructionMultiplier" DOUBLE PRECISION,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MacroProfileOverride_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MacroProfileOverride_isActive_priority_idx"
ON "MacroProfileOverride"("isActive", "priority");

CREATE INDEX "MacroProfileOverride_country_assetClass_idx"
ON "MacroProfileOverride"("country", "assetClass");
