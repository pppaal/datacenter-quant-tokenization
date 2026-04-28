import assert from 'node:assert/strict';
import test from 'node:test';
import { AssetClass, AssetStage, AssetStatus, ReviewStatus, SourceStatus } from '@prisma/client';
import { buildValuationAnalysis } from '@/lib/services/valuation-engine';

test('retail valuation produces a retail-style underwriting output', async () => {
  const now = new Date();

  const analysis = await buildValuationAnalysis({
    asset: {
      id: 'retail_asset_1',
      assetCode: 'SEOUL-RETAIL-01',
      slug: 'seoul-retail-01-neighborhood-center',
      name: 'Seoul Neighborhood Retail Center',
      assetClass: AssetClass.RETAIL,
      assetType: 'Retail',
      assetSubtype: 'Neighborhood Center',
      market: 'KR',
      status: AssetStatus.UNDER_REVIEW,
      stage: AssetStage.STABILIZED,
      description: 'Neighborhood retail underwriting case.',
      ownerName: null,
      sponsorName: null,
      developmentSummary: null,
      targetItLoadMw: null,
      powerCapacityMw: null,
      landAreaSqm: 7900,
      grossFloorAreaSqm: 13600,
      rentableAreaSqm: 12400,
      purchasePriceKrw: 92000000000,
      occupancyAssumptionPct: 89,
      stabilizedOccupancyPct: 91,
      tenantAssumption: 'Grocery, F&B, and service retail mix',
      capexAssumptionKrw: 2400000000,
      opexAssumptionKrw: 6100000000,
      financingLtvPct: 51,
      financingRatePct: 5.1,
      holdingPeriodYears: 5,
      exitCapRatePct: 5.8,
      currentValuationKrw: null,
      lastEnrichedAt: now,
      createdAt: now,
      updatedAt: now
    },
    address: {
      id: 'retail_address_1',
      assetId: 'retail_asset_1',
      line1: '44 Hangang-daero',
      line2: null,
      district: 'Yongsan-gu',
      city: 'Seoul',
      province: 'Seoul',
      postalCode: null,
      country: 'KR',
      latitude: 37.53,
      longitude: 126.97,
      parcelId: null,
      sourceLabel: 'manual intake',
      createdAt: now,
      updatedAt: now
    },
    siteProfile: {
      id: 'retail_site_1',
      assetId: 'retail_asset_1',
      gridAvailability: 'Urban utility service confirmed',
      fiberAccess: 'Carrier access available',
      latencyProfile: 'Standard site access review',
      floodRiskScore: 1.1,
      wildfireRiskScore: 0.1,
      seismicRiskScore: 0.5,
      siteNotes: 'Transit-adjacent neighborhood retail node.',
      sourceStatus: SourceStatus.MANUAL,
      sourceUpdatedAt: now,
      createdAt: now,
      updatedAt: now
    },
    buildingSnapshot: {
      id: 'retail_building_1',
      assetId: 'retail_asset_1',
      zoning: 'Commercial',
      buildingCoveragePct: 61,
      floorAreaRatioPct: 420,
      grossFloorAreaSqm: 13600,
      structureDescription: 'Mid-rise retail center',
      redundancyTier: null,
      coolingType: null,
      sourceStatus: SourceStatus.MANUAL,
      sourceUpdatedAt: now,
      createdAt: now,
      updatedAt: now
    },
    permitSnapshot: {
      id: 'retail_permit_1',
      assetId: 'retail_asset_1',
      permitStage: 'Operational',
      zoningApprovalStatus: 'Approved',
      environmentalReviewStatus: 'Complete',
      powerApprovalStatus: 'Operational',
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
      id: 'retail_energy_1',
      assetId: 'retail_asset_1',
      utilityName: 'KEPCO Seoul',
      substationDistanceKm: null,
      tariffKrwPerKwh: 134,
      renewableAvailabilityPct: 17,
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
      id: 'retail_market_1',
      assetId: 'retail_asset_1',
      metroRegion: 'Seoul Urban Retail',
      vacancyPct: 8.5,
      colocationRatePerKwKrw: null,
      capRatePct: 5.7,
      debtCostPct: 5,
      inflationPct: 2,
      constructionCostPerMwKrw: null,
      discountRatePct: 7.8,
      marketNotes: 'Neighborhood retail remains bifurcated by tenant quality and footfall.',
      sourceStatus: SourceStatus.MANUAL,
      sourceUpdatedAt: now,
      createdAt: now,
      updatedAt: now
    },
    comparableSet: {
      id: 'retail_comp_set_1',
      assetId: 'retail_asset_1',
      name: 'Retail comps',
      valuationDate: now,
      calibrationMode: 'Market evidence',
      notes: null,
      createdAt: now,
      updatedAt: now,
      entries: [
        {
          id: 'retail_comp_1',
          comparableSetId: 'retail_comp_set_1',
          label: 'Retail Comp A',
          location: 'Seoul',
          assetType: 'Retail',
          stage: AssetStage.STABILIZED,
          sourceLink: null,
          powerCapacityMw: null,
          grossFloorAreaSqm: 14200,
          occupancyPct: 93,
          pricePerMwKrw: null,
          valuationKrw: 98500000000,
          monthlyRatePerKwKrw: null,
          capRatePct: 5.6,
          discountRatePct: 7.7,
          weightPct: 0.55,
          notes: null,
          createdAt: now
        },
        {
          id: 'retail_comp_2',
          comparableSetId: 'retail_comp_set_1',
          label: 'Retail Comp B',
          location: 'Seoul',
          assetType: 'Retail',
          stage: AssetStage.STABILIZED,
          sourceLink: null,
          powerCapacityMw: null,
          grossFloorAreaSqm: 11800,
          occupancyPct: 89,
          pricePerMwKrw: null,
          valuationKrw: 87400000000,
          monthlyRatePerKwKrw: null,
          capRatePct: 5.8,
          discountRatePct: 7.9,
          weightPct: 0.45,
          notes: null,
          createdAt: now
        }
      ]
    }
  });

  assert.equal(analysis.asset.assetClass, AssetClass.RETAIL);
  assert.equal(analysis.scenarios.length, 3);
  assert.ok(analysis.baseCaseValueKrw > 0);
  assert.equal((analysis.assumptions as Record<string, unknown>).assetClass, 'RETAIL');
  assert.ok(((analysis.assumptions as Record<string, unknown>).monthlyRentPerSqmKrw as number) > 0);
  assert.ok(
    analysis.keyRisks.some(
      (risk) => risk.toLowerCase().includes('retail') || risk.toLowerCase().includes('tenant')
    )
  );
});
