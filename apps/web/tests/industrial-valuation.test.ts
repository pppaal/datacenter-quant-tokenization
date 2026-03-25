import assert from 'node:assert/strict';
import test from 'node:test';
import { AssetClass, AssetStage, AssetStatus, SourceStatus } from '@prisma/client';
import { buildValuationAnalysis } from '@/lib/services/valuation-engine';

test('industrial valuation produces a logistics-style underwriting output', async () => {
  const now = new Date();

  const analysis = await buildValuationAnalysis({
    asset: {
      id: 'industrial_asset_1',
      assetCode: 'INCHEON-LOGISTICS-01',
      slug: 'incheon-logistics-01-hub',
      name: 'Incheon Logistics Hub',
      assetClass: AssetClass.INDUSTRIAL,
      assetType: 'Industrial',
      assetSubtype: 'Logistics',
      market: 'KR',
      status: AssetStatus.UNDER_REVIEW,
      stage: AssetStage.STABILIZED,
      description: 'Modern logistics asset underwriting case.',
      ownerName: null,
      sponsorName: null,
      developmentSummary: null,
      targetItLoadMw: null,
      powerCapacityMw: null,
      landAreaSqm: 28600,
      grossFloorAreaSqm: 51200,
      rentableAreaSqm: 48600,
      purchasePriceKrw: 188000000000,
      occupancyAssumptionPct: 95,
      stabilizedOccupancyPct: 96,
      tenantAssumption: '3PL and e-commerce mix',
      capexAssumptionKrw: 3500000000,
      opexAssumptionKrw: 8200000000,
      financingLtvPct: 54,
      financingRatePct: 4.8,
      holdingPeriodYears: 5,
      exitCapRatePct: 5.2,
      currentValuationKrw: null,
      lastEnrichedAt: now,
      createdAt: now,
      updatedAt: now
    },
    address: {
      id: 'industrial_address_1',
      assetId: 'industrial_asset_1',
      line1: '88 Port Logistics-ro',
      line2: null,
      district: 'Jung-gu',
      city: 'Incheon',
      province: 'Incheon',
      postalCode: null,
      country: 'KR',
      latitude: 37.468,
      longitude: 126.623,
      parcelId: null,
      sourceLabel: 'manual intake',
      createdAt: now,
      updatedAt: now
    },
    siteProfile: {
      id: 'industrial_site_1',
      assetId: 'industrial_asset_1',
      gridAvailability: 'Industrial utility service confirmed',
      fiberAccess: 'Carrier access available',
      latencyProfile: 'Standard site access review',
      floodRiskScore: 1.7,
      wildfireRiskScore: 0.2,
      seismicRiskScore: 0.7,
      siteNotes: 'Port-adjacent logistics corridor.',
      sourceStatus: SourceStatus.MANUAL,
      sourceUpdatedAt: now,
      createdAt: now,
      updatedAt: now
    },
    buildingSnapshot: {
      id: 'industrial_building_1',
      assetId: 'industrial_asset_1',
      zoning: 'Industrial',
      buildingCoveragePct: 48,
      floorAreaRatioPct: 185,
      grossFloorAreaSqm: 51200,
      structureDescription: 'Modern warehouse',
      redundancyTier: null,
      coolingType: null,
      sourceStatus: SourceStatus.MANUAL,
      sourceUpdatedAt: now,
      createdAt: now,
      updatedAt: now
    },
    permitSnapshot: {
      id: 'industrial_permit_1',
      assetId: 'industrial_asset_1',
      permitStage: 'Operational',
      zoningApprovalStatus: 'Approved',
      environmentalReviewStatus: 'Complete',
      powerApprovalStatus: 'Operational',
      timelineNotes: 'Existing operating asset',
      sourceStatus: SourceStatus.MANUAL,
      sourceUpdatedAt: now,
      createdAt: now,
      updatedAt: now
    },
    energySnapshot: {
      id: 'industrial_energy_1',
      assetId: 'industrial_asset_1',
      utilityName: 'KEPCO Incheon',
      substationDistanceKm: null,
      tariffKrwPerKwh: 126,
      renewableAvailabilityPct: 15,
      pueTarget: null,
      backupFuelHours: null,
      sourceStatus: SourceStatus.MANUAL,
      sourceUpdatedAt: now,
      createdAt: now,
      updatedAt: now
    },
    marketSnapshot: {
      id: 'industrial_market_1',
      assetId: 'industrial_asset_1',
      metroRegion: 'Incheon Logistics Belt',
      vacancyPct: 4.8,
      colocationRatePerKwKrw: null,
      capRatePct: 5.1,
      debtCostPct: 4.7,
      inflationPct: 2.1,
      constructionCostPerMwKrw: null,
      discountRatePct: 7.2,
      marketNotes: 'Logistics take-up remains resilient.',
      sourceStatus: SourceStatus.MANUAL,
      sourceUpdatedAt: now,
      createdAt: now,
      updatedAt: now
    },
    comparableSet: {
      id: 'industrial_comp_set_1',
      assetId: 'industrial_asset_1',
      name: 'Logistics comps',
      valuationDate: now,
      calibrationMode: 'Market evidence',
      notes: null,
      createdAt: now,
      updatedAt: now,
      entries: [
        {
          id: 'industrial_comp_1',
          comparableSetId: 'industrial_comp_set_1',
          label: 'Incheon Hub A',
          location: 'Incheon',
          assetType: 'Industrial',
          stage: AssetStage.STABILIZED,
          sourceLink: null,
          powerCapacityMw: null,
          grossFloorAreaSqm: 50000,
          occupancyPct: 97,
          pricePerMwKrw: null,
          valuationKrw: 182000000000,
          monthlyRatePerKwKrw: null,
          capRatePct: 5,
          discountRatePct: 7.1,
          weightPct: 0.6,
          notes: null,
          createdAt: now
        },
        {
          id: 'industrial_comp_2',
          comparableSetId: 'industrial_comp_set_1',
          label: 'Gimpo Logistics B',
          location: 'Gimpo',
          assetType: 'Industrial',
          stage: AssetStage.STABILIZED,
          sourceLink: null,
          powerCapacityMw: null,
          grossFloorAreaSqm: 46800,
          occupancyPct: 95,
          pricePerMwKrw: null,
          valuationKrw: 176000000000,
          monthlyRatePerKwKrw: null,
          capRatePct: 5.15,
          discountRatePct: 7.25,
          weightPct: 0.4,
          notes: null,
          createdAt: now
        }
      ]
    }
  });

  assert.equal(analysis.asset.assetClass, AssetClass.INDUSTRIAL);
  assert.equal(analysis.scenarios.length, 3);
  assert.ok(analysis.baseCaseValueKrw > 0);
  assert.equal((analysis.assumptions as Record<string, unknown>).assetClass, 'INDUSTRIAL');
  assert.ok(((analysis.assumptions as Record<string, unknown>).monthlyRentPerSqmKrw as number) > 0);
  assert.ok(analysis.keyRisks.some((risk) => risk.toLowerCase().includes('logistics') || risk.toLowerCase().includes('occupancy')));
});
