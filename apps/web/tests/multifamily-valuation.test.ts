import assert from 'node:assert/strict';
import test from 'node:test';
import { AssetClass, AssetStage, AssetStatus, ReviewStatus, SourceStatus } from '@prisma/client';
import { buildValuationAnalysis } from '@/lib/services/valuation-engine';

test('multifamily valuation produces a residential underwriting output', async () => {
  const now = new Date();

  const analysis = await buildValuationAnalysis({
    asset: {
      id: 'mf_asset_1',
      assetCode: 'SEOUL-MF-01',
      slug: 'seoul-mf-01-riverfront-apartments',
      name: 'Seoul Riverfront Apartments',
      assetClass: AssetClass.MULTIFAMILY,
      assetType: 'Multifamily',
      assetSubtype: 'Mid-rise',
      market: 'KR',
      status: AssetStatus.UNDER_REVIEW,
      stage: AssetStage.STABILIZED,
      description: 'Residential underwriting case.',
      ownerName: null,
      sponsorName: null,
      developmentSummary: null,
      targetItLoadMw: null,
      powerCapacityMw: null,
      landAreaSqm: 5800,
      grossFloorAreaSqm: 10400,
      rentableAreaSqm: 9600,
      purchasePriceKrw: 118000000000,
      occupancyAssumptionPct: 95,
      stabilizedOccupancyPct: 96,
      tenantAssumption: 'Urban renter mix',
      capexAssumptionKrw: 3200000000,
      opexAssumptionKrw: 7600000000,
      financingLtvPct: 52,
      financingRatePct: 4.7,
      holdingPeriodYears: 5,
      exitCapRatePct: 4.6,
      currentValuationKrw: null,
      lastEnrichedAt: now,
      createdAt: now,
      updatedAt: now
    },
    address: {
      id: 'mf_address_1',
      assetId: 'mf_asset_1',
      line1: '12 Riverside-ro',
      line2: null,
      district: 'Mapo-gu',
      city: 'Seoul',
      province: 'Seoul',
      postalCode: null,
      country: 'KR',
      latitude: 37.55,
      longitude: 126.91,
      parcelId: null,
      sourceLabel: 'manual intake',
      createdAt: now,
      updatedAt: now
    },
    siteProfile: {
      id: 'mf_site_1',
      assetId: 'mf_asset_1',
      gridAvailability: 'Urban utility service confirmed',
      fiberAccess: 'Carrier access available',
      latencyProfile: 'Standard site access review',
      floodRiskScore: 1.2,
      wildfireRiskScore: 0.1,
      seismicRiskScore: 0.5,
      siteNotes: 'Transit-accessible residential neighborhood.',
      sourceStatus: SourceStatus.MANUAL,
      sourceUpdatedAt: now,
      createdAt: now,
      updatedAt: now
    },
    buildingSnapshot: {
      id: 'mf_building_1',
      assetId: 'mf_asset_1',
      zoning: 'Residential',
      buildingCoveragePct: 54,
      floorAreaRatioPct: 275,
      grossFloorAreaSqm: 10400,
      structureDescription: 'Mid-rise apartment block',
      redundancyTier: null,
      coolingType: null,
      sourceStatus: SourceStatus.MANUAL,
      sourceUpdatedAt: now,
      createdAt: now,
      updatedAt: now
    },
    permitSnapshot: {
      id: 'mf_permit_1',
      assetId: 'mf_asset_1',
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
      id: 'mf_energy_1',
      assetId: 'mf_asset_1',
      utilityName: 'KEPCO Seoul',
      substationDistanceKm: null,
      tariffKrwPerKwh: 128,
      renewableAvailabilityPct: 16,
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
      id: 'mf_market_1',
      assetId: 'mf_asset_1',
      metroRegion: 'Seoul Residential',
      vacancyPct: 3.2,
      colocationRatePerKwKrw: null,
      capRatePct: 4.5,
      debtCostPct: 4.6,
      inflationPct: 2,
      constructionCostPerMwKrw: null,
      discountRatePct: 6.8,
      marketNotes: 'Urban rental demand remains resilient.',
      sourceStatus: SourceStatus.MANUAL,
      sourceUpdatedAt: now,
      createdAt: now,
      updatedAt: now
    },
    comparableSet: {
      id: 'mf_comp_set_1',
      assetId: 'mf_asset_1',
      name: 'Residential comps',
      valuationDate: now,
      calibrationMode: 'Market evidence',
      notes: null,
      createdAt: now,
      updatedAt: now,
      entries: [
        {
          id: 'mf_comp_1',
          comparableSetId: 'mf_comp_set_1',
          label: 'Mapo Apartments A',
          location: 'Mapo',
          assetType: 'Multifamily',
          stage: AssetStage.STABILIZED,
          sourceLink: null,
          powerCapacityMw: null,
          grossFloorAreaSqm: 9800,
          occupancyPct: 97,
          pricePerMwKrw: null,
          valuationKrw: 121000000000,
          monthlyRatePerKwKrw: null,
          capRatePct: 4.4,
          discountRatePct: 6.7,
          weightPct: 0.55,
          notes: null,
          createdAt: now
        },
        {
          id: 'mf_comp_2',
          comparableSetId: 'mf_comp_set_1',
          label: 'Yongsan Apartments B',
          location: 'Yongsan',
          assetType: 'Multifamily',
          stage: AssetStage.STABILIZED,
          sourceLink: null,
          powerCapacityMw: null,
          grossFloorAreaSqm: 10100,
          occupancyPct: 95,
          pricePerMwKrw: null,
          valuationKrw: 116000000000,
          monthlyRatePerKwKrw: null,
          capRatePct: 4.6,
          discountRatePct: 6.9,
          weightPct: 0.45,
          notes: null,
          createdAt: now
        }
      ]
    }
  });

  assert.equal(analysis.asset.assetClass, AssetClass.MULTIFAMILY);
  assert.equal(analysis.scenarios.length, 3);
  assert.ok(analysis.baseCaseValueKrw > 0);
  assert.equal((analysis.assumptions as Record<string, unknown>).assetClass, 'MULTIFAMILY');
  assert.ok(((analysis.assumptions as Record<string, unknown>).monthlyRentPerSqmKrw as number) > 0);
  assert.ok(
    analysis.keyRisks.some(
      (risk) =>
        risk.toLowerCase().includes('residential') || risk.toLowerCase().includes('occupancy')
    )
  );
});
