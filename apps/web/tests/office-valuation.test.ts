import assert from 'node:assert/strict';
import test from 'node:test';
import { AssetClass, AssetStage, AssetStatus, ReviewStatus, SourceStatus } from '@prisma/client';
import { buildValuationAnalysis } from '@/lib/services/valuation-engine';

test('office valuation uses office detail assumptions and produces scenarios', async () => {
  const now = new Date();

  const analysis = await buildValuationAnalysis({
    asset: {
      id: 'office_asset_1',
      assetCode: 'SEOUL-YEOUIDO-01',
      slug: 'seoul-yeouido-01-core-office-tower',
      name: 'Yeouido Core Office Tower',
      assetClass: AssetClass.OFFICE,
      assetType: 'Office',
      assetSubtype: 'Core',
      market: 'KR',
      status: AssetStatus.UNDER_REVIEW,
      stage: AssetStage.STABILIZED,
      description: 'Prime office underwriting case.',
      ownerName: null,
      sponsorName: null,
      developmentSummary: null,
      targetItLoadMw: null,
      powerCapacityMw: null,
      landAreaSqm: 4200,
      grossFloorAreaSqm: 34100,
      rentableAreaSqm: 28500,
      purchasePriceKrw: 312000000000,
      occupancyAssumptionPct: 93,
      stabilizedOccupancyPct: 95,
      tenantAssumption: 'Diversified domestic office tenants',
      capexAssumptionKrw: 6800000000,
      opexAssumptionKrw: 14500000000,
      financingLtvPct: 52,
      financingRatePct: 4.9,
      holdingPeriodYears: 5,
      exitCapRatePct: 4.9,
      currentValuationKrw: null,
      lastEnrichedAt: now,
      createdAt: now,
      updatedAt: now
    },
    address: {
      id: 'office_address_1',
      assetId: 'office_asset_1',
      line1: '1 International Finance-ro',
      line2: null,
      district: 'Yeongdeungpo-gu',
      city: 'Seoul',
      province: 'Seoul',
      postalCode: null,
      country: 'KR',
      latitude: 37.525,
      longitude: 126.925,
      parcelId: null,
      sourceLabel: 'manual intake',
      createdAt: now,
      updatedAt: now
    },
    siteProfile: {
      id: 'office_site_1',
      assetId: 'office_asset_1',
      gridAvailability: 'CBD utility service confirmed',
      fiberAccess: 'Multi-carrier building access',
      latencyProfile: 'Metro office core',
      floodRiskScore: 1.4,
      wildfireRiskScore: 0.1,
      seismicRiskScore: 0.6,
      siteNotes: 'Prime office tower near Yeouido Station.',
      sourceStatus: SourceStatus.MANUAL,
      sourceUpdatedAt: now,
      createdAt: now,
      updatedAt: now
    },
    buildingSnapshot: {
      id: 'office_building_1',
      assetId: 'office_asset_1',
      zoning: 'Commercial',
      buildingCoveragePct: 58,
      floorAreaRatioPct: 830,
      grossFloorAreaSqm: 34100,
      structureDescription: 'High-rise steel and concrete office tower',
      redundancyTier: null,
      coolingType: 'Central HVAC',
      sourceStatus: SourceStatus.MANUAL,
      sourceUpdatedAt: now,
      createdAt: now,
      updatedAt: now
    },
    permitSnapshot: {
      id: 'office_permit_1',
      assetId: 'office_asset_1',
      permitStage: 'Operational',
      zoningApprovalStatus: 'Approved',
      environmentalReviewStatus: 'Complete',
      powerApprovalStatus: 'N/A',
      timelineNotes: 'Existing operating asset',
      sourceStatus: SourceStatus.MANUAL,
      sourceUpdatedAt: now,
      reviewStatus: ReviewStatus.APPROVED,
      reviewedAt: now,
      reviewedById: null,
      reviewNotes: null,
      createdAt: now,
      updatedAt: now
    },
    energySnapshot: {
      id: 'office_energy_1',
      assetId: 'office_asset_1',
      utilityName: 'KEPCO Seoul',
      substationDistanceKm: null,
      tariffKrwPerKwh: 132,
      renewableAvailabilityPct: 18,
      pueTarget: null,
      backupFuelHours: null,
      sourceStatus: SourceStatus.MANUAL,
      sourceUpdatedAt: now,
      reviewStatus: ReviewStatus.APPROVED,
      reviewedAt: now,
      reviewedById: null,
      reviewNotes: null,
      createdAt: now,
      updatedAt: now
    },
    marketSnapshot: {
      id: 'office_market_1',
      assetId: 'office_asset_1',
      metroRegion: 'Yeouido',
      vacancyPct: 6.2,
      colocationRatePerKwKrw: null,
      capRatePct: 4.8,
      debtCostPct: 4.7,
      inflationPct: 2.1,
      constructionCostPerMwKrw: null,
      discountRatePct: 7.4,
      marketNotes: 'Prime Seoul office cap rates remain tight.',
      sourceStatus: SourceStatus.MANUAL,
      sourceUpdatedAt: now,
      createdAt: now,
      updatedAt: now
    },
    officeDetail: {
      id: 'office_detail_1',
      assetId: 'office_asset_1',
      stabilizedRentPerSqmMonthKrw: 38500,
      otherIncomeKrw: 850000000,
      vacancyAllowancePct: 4.5,
      creditLossPct: 1.2,
      tenantImprovementReserveKrw: 1200000000,
      leasingCommissionReserveKrw: 420000000,
      annualCapexReserveKrw: 380000000,
      weightedAverageLeaseTermYears: 4.4,
      createdAt: now,
      updatedAt: now
    },
    comparableSet: {
      id: 'office_comp_set_1',
      assetId: 'office_asset_1',
      name: 'Prime office comps',
      valuationDate: now,
      calibrationMode: 'Market evidence',
      notes: null,
      createdAt: now,
      updatedAt: now,
      entries: [
        {
          id: 'office_comp_1',
          comparableSetId: 'office_comp_set_1',
          label: 'Yeouido Office Comp A',
          location: 'Yeouido',
          assetType: 'Office',
          stage: AssetStage.STABILIZED,
          sourceLink: null,
          powerCapacityMw: null,
          grossFloorAreaSqm: 32000,
          occupancyPct: 94,
          pricePerMwKrw: null,
          valuationKrw: 298000000000,
          monthlyRatePerKwKrw: null,
          capRatePct: 4.7,
          discountRatePct: 7.2,
          weightPct: 0.55,
          notes: null,
          createdAt: now
        },
        {
          id: 'office_comp_2',
          comparableSetId: 'office_comp_set_1',
          label: 'CBD Office Comp B',
          location: 'Central Seoul',
          assetType: 'Office',
          stage: AssetStage.STABILIZED,
          sourceLink: null,
          powerCapacityMw: null,
          grossFloorAreaSqm: 35500,
          occupancyPct: 92,
          pricePerMwKrw: null,
          valuationKrw: 338000000000,
          monthlyRatePerKwKrw: null,
          capRatePct: 4.9,
          discountRatePct: 7.5,
          weightPct: 0.45,
          notes: null,
          createdAt: now
        }
      ]
    }
  });

  assert.equal(analysis.asset.assetClass, AssetClass.OFFICE);
  assert.equal(analysis.scenarios.length, 3);
  assert.ok(analysis.baseCaseValueKrw > 0);
  assert.equal((analysis.assumptions as Record<string, unknown>).assetClass, 'OFFICE');
  assert.equal(
    (analysis.assumptions as Record<string, unknown>).weightedAverageLeaseTermYears,
    4.4
  );
  assert.ok(((analysis.assumptions as Record<string, unknown>).monthlyRentPerSqmKrw as number) > 0);
  assert.equal(
    typeof ((analysis.assumptions as Record<string, unknown>).macroRegime as { regimes?: object })
      .regimes,
    'object'
  );
  assert.ok(analysis.keyRisks.some((risk) => risk.toLowerCase().includes('lease')));
});
