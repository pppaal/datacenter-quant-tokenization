import assert from 'node:assert/strict';
import test from 'node:test';
import { AssetClass, AssetStage, AssetStatus, SourceStatus } from '@prisma/client';
import { createValuationRun } from '@/lib/services/valuations';

test('valuation run persists scenario analysis with provenance', async () => {
  let capturedCreate: any;
  let capturedUpdate: any;

  const asset = {
    id: 'asset_valuation_1',
    assetCode: 'SEOUL-GANGSEO-01',
    slug: 'seoul-gangseo-01-seoul-hyperscale-campus',
    name: 'Seoul Hyperscale Campus I',
    assetClass: AssetClass.DATA_CENTER,
    assetType: 'Data Center',
    assetSubtype: null,
    market: 'KR',
    status: AssetStatus.UNDER_REVIEW,
    stage: AssetStage.POWER_REVIEW,
    description: 'Institutional review case.',
    ownerName: null,
    sponsorName: null,
    developmentSummary: null,
    targetItLoadMw: 28,
    powerCapacityMw: 32,
    landAreaSqm: 18400,
    grossFloorAreaSqm: 72800,
    rentableAreaSqm: null,
    purchasePriceKrw: null,
    occupancyAssumptionPct: 78,
    stabilizedOccupancyPct: null,
    tenantAssumption: 'Cloud anchors',
    capexAssumptionKrw: 246000000000,
    opexAssumptionKrw: 9200000000,
    financingLtvPct: 58,
    financingRatePct: 5.2,
    holdingPeriodYears: null,
    exitCapRatePct: null,
    currentValuationKrw: null,
    lastEnrichedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    address: {
      id: 'address_1',
      assetId: 'asset_valuation_1',
      line1: '148 Gonghang-daero',
      line2: null,
      district: 'Gangseo-gu',
      city: 'Seoul',
      province: 'Seoul',
      postalCode: null,
      country: 'KR',
      latitude: 37.5607,
      longitude: 126.8235,
      parcelId: '11500-2034',
      sourceLabel: 'seed',
      createdAt: new Date(),
      updatedAt: new Date()
    },
    siteProfile: {
      id: 'site_1',
      assetId: 'asset_valuation_1',
      gridAvailability: '154 kV line available within 1.2 km',
      fiberAccess: 'Dual carrier route confirmed',
      latencyProfile: 'Sub-10ms to Seoul IX core',
      floodRiskScore: 1.8,
      wildfireRiskScore: 0.8,
      seismicRiskScore: 1.1,
      siteNotes: 'Drainage diligence required.',
      sourceStatus: SourceStatus.FRESH,
      sourceUpdatedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    },
    buildingSnapshot: {
      id: 'building_1',
      assetId: 'asset_valuation_1',
      zoning: 'Semi-industrial',
      buildingCoveragePct: 54,
      floorAreaRatioPct: 289,
      grossFloorAreaSqm: 72800,
      structureDescription: '12-storey shell',
      redundancyTier: 'Tier III+',
      coolingType: 'Hybrid chilled-water',
      sourceStatus: SourceStatus.FRESH,
      sourceUpdatedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    },
    permitSnapshot: {
      id: 'permit_1',
      assetId: 'asset_valuation_1',
      permitStage: 'Power allocation review',
      zoningApprovalStatus: 'Compliant',
      environmentalReviewStatus: 'Study submitted',
      powerApprovalStatus: 'Pending final utility committee slot',
      timelineNotes: 'Expected within 2 quarters',
      sourceStatus: SourceStatus.FRESH,
      sourceUpdatedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    },
    energySnapshot: {
      id: 'energy_1',
      assetId: 'asset_valuation_1',
      utilityName: 'KEPCO West Seoul',
      substationDistanceKm: 1.2,
      tariffKrwPerKwh: 143,
      renewableAvailabilityPct: 32,
      pueTarget: 1.31,
      backupFuelHours: 48,
      sourceStatus: SourceStatus.FRESH,
      sourceUpdatedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    },
    marketSnapshot: {
      id: 'market_1',
      assetId: 'asset_valuation_1',
      metroRegion: 'Seoul Northwest',
      vacancyPct: 6.1,
      colocationRatePerKwKrw: 220000,
      capRatePct: 6.1,
      debtCostPct: 5.2,
      inflationPct: 2.3,
      constructionCostPerMwKrw: 7800000000,
      discountRatePct: 9.4,
      marketNotes: 'Demand remains strong.',
      sourceStatus: SourceStatus.FRESH,
      sourceUpdatedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    },
    documents: [],
    valuations: [],
    readinessProject: null
  };

  const fakeDb = {
    asset: {
      async findUnique() {
        return asset;
      },
      async update(args: any) {
        capturedUpdate = args;
        return args;
      }
    },
    valuationRun: {
      async create(args: any) {
        capturedCreate = args;
        return {
          id: 'run_1',
          ...args.data,
          asset,
          scenarios: args.data.scenarios.create
        };
      }
    }
  };

  const result = (await createValuationRun(
    {
      assetId: asset.id,
      runLabel: 'Committee refresh'
    },
    fakeDb as any
  )) as any;

  assert.equal(result.runLabel, 'Committee refresh');
  assert.equal(result.scenarios.length, 3);
  assert.match(capturedCreate.data.engineVersion, /^kdc-kr-(py|ts)-v1$/);
  assert.ok(Array.isArray(capturedCreate.data.provenance));
  assert.ok(capturedCreate.data.baseCaseValueKrw > 0);
  assert.equal(capturedCreate.data.sensitivityRuns.create.length, 6);
  assert.equal(capturedCreate.data.sensitivityRuns.create[0].runType, 'ONE_WAY');
  assert.equal(capturedCreate.data.sensitivityRuns.create[0].points.create.length, 8);
  assert.equal(capturedCreate.data.sensitivityRuns.create[1].runType, 'BREACH_POINT');
  assert.equal(capturedCreate.data.sensitivityRuns.create[1].points.create.length, 4);
  assert.equal(capturedCreate.data.sensitivityRuns.create[2].runType, 'MATRIX');
  assert.equal(capturedCreate.data.sensitivityRuns.create[2].points.create.length, 9);
  assert.equal(capturedCreate.data.sensitivityRuns.create[3].runType, 'MATRIX');
  assert.equal(capturedCreate.data.sensitivityRuns.create[3].points.create.length, 9);
  assert.equal(capturedCreate.data.sensitivityRuns.create[4].runType, 'FORECAST');
  assert.equal(capturedCreate.data.sensitivityRuns.create[4].points.create.length, 10);
  assert.equal(capturedCreate.data.sensitivityRuns.create[5].runType, 'MONTE_CARLO');
  assert.equal(capturedCreate.data.sensitivityRuns.create[5].points.create.length, 10);
  assert.equal(capturedUpdate.data.currentValuationKrw, capturedCreate.data.baseCaseValueKrw);
});
