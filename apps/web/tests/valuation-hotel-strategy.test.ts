import assert from 'node:assert/strict';
import test from 'node:test';
import { AssetClass, AssetStage, AssetStatus, SourceStatus } from '@prisma/client';
import { buildStabilizedIncomeValuation } from '@/lib/services/valuation/stabilized-income';
import { buildOfficeValuationConfig } from '@/lib/services/valuation/stabilized-income-configs';
import {
  buildHotelValuationAnalysis,
  buildHotelValuationConfig
} from '@/lib/services/valuation/strategies/hotel';
import type { UnderwritingBundle } from '@/lib/services/valuation/types';

const now = new Date();

// Minimal hospitality bundle. opexAssumptionKrw is intentionally left null
// so the per-class config's opex ratio (hotel ~65% vs office ~18%) drives
// the NOI margin comparison rather than an asset-level override.
function buildHotelBundle(): UnderwritingBundle {
  return {
    asset: {
      id: 'hotel_asset_1',
      assetCode: 'SEOUL-HOTEL-01',
      slug: 'seoul-hotel-01-upscale',
      name: 'Seoul Upscale Hotel',
      assetClass: AssetClass.HOTEL,
      assetType: 'Hotel',
      assetSubtype: 'Upscale',
      market: 'KR',
      status: AssetStatus.UNDER_REVIEW,
      stage: AssetStage.STABILIZED,
      description: 'Upscale full-service hotel underwriting case.',
      ownerName: null,
      sponsorName: null,
      developmentSummary: null,
      targetItLoadMw: null,
      powerCapacityMw: null,
      landAreaSqm: 6200,
      grossFloorAreaSqm: 18000,
      rentableAreaSqm: 16000,
      purchasePriceKrw: 120000000000,
      occupancyAssumptionPct: 70,
      stabilizedOccupancyPct: 72,
      tenantAssumption: 'Operator-managed, branded full-service hotel',
      capexAssumptionKrw: null,
      opexAssumptionKrw: null,
      financingLtvPct: null,
      financingRatePct: null,
      holdingPeriodYears: 5,
      exitCapRatePct: null,
      currentValuationKrw: null,
      lastEnrichedAt: now,
      createdAt: now,
      updatedAt: now
    } as UnderwritingBundle['asset'],
    address: {
      id: 'hotel_address_1',
      assetId: 'hotel_asset_1',
      line1: '120 Sejong-daero',
      line2: null,
      district: 'Jung-gu',
      city: 'Seoul',
      province: 'Seoul',
      postalCode: null,
      country: 'KR',
      latitude: 37.566,
      longitude: 126.978,
      parcelId: null,
      sourceLabel: 'manual intake',
      createdAt: now,
      updatedAt: now
    } as UnderwritingBundle['address'],
    siteProfile: null,
    buildingSnapshot: null,
    permitSnapshot: null,
    energySnapshot: null,
    marketSnapshot: {
      id: 'hotel_market_1',
      assetId: 'hotel_asset_1',
      metroRegion: 'Seoul CBD Hospitality',
      vacancyPct: 28,
      colocationRatePerKwKrw: null,
      capRatePct: 6.6,
      debtCostPct: 5.4,
      inflationPct: 2,
      constructionCostPerMwKrw: null,
      discountRatePct: 8.5,
      marketNotes: 'CBD hospitality demand recovering but RevPAR remains seasonal.',
      sourceStatus: SourceStatus.MANUAL,
      sourceUpdatedAt: now,
      createdAt: now,
      updatedAt: now
    } as UnderwritingBundle['marketSnapshot'],
    macroSeries: [],
    comparableSet: null,
    creditAssessments: []
  };
}

function effectiveNoiMargin(config: ReturnType<typeof buildHotelValuationConfig>): number {
  const valuation = buildStabilizedIncomeValuation(buildHotelBundle(), {}, config);
  const revenue = valuation.effectiveRentalRevenueKrw + valuation.otherIncomeKrw;
  return valuation.stabilizedNoiKrw / revenue;
}

test('hotel valuation returns a positive base case and ordered scenarios', async () => {
  const analysis = await buildHotelValuationAnalysis(buildHotelBundle());

  assert.equal(analysis.asset.assetClass, AssetClass.HOTEL);
  assert.ok(analysis.baseCaseValueKrw > 0, 'base case value should be positive');

  assert.equal(analysis.scenarios.length, 3);
  const [bull, base, bear] = analysis.scenarios;
  assert.equal(bull.name, 'Bull');
  assert.equal(base.name, 'Base');
  assert.equal(bear.name, 'Bear');
  assert.ok(
    bull.valuationKrw >= base.valuationKrw && base.valuationKrw >= bear.valuationKrw,
    'scenarios must be ordered Bull >= Base >= Bear by valuation'
  );

  // Engine clamps confidence between the config floor and ceiling.
  assert.ok(
    analysis.confidenceScore >= 4.6 && analysis.confidenceScore <= 8.8,
    'confidence score should be within the engine clamp'
  );

  // memo is the deterministic offline fallback (no OPENAI_API_KEY).
  assert.ok(analysis.underwritingMemo.length > 0);
});

test('hotel opex ratio is hospitality-grade vs office', () => {
  const hotelMargin = effectiveNoiMargin(buildHotelValuationConfig());
  const officeMargin = effectiveNoiMargin(buildOfficeValuationConfig());

  assert.ok(
    hotelMargin < officeMargin,
    `hotel NOI margin (${hotelMargin.toFixed(3)}) should be below office (${officeMargin.toFixed(3)})`
  );
  // Hospitality opex (~65% of revenue) should push the margin materially
  // lower than the office case (~18% opex).
  assert.ok(
    officeMargin - hotelMargin > 0.2,
    `margin gap (${(officeMargin - hotelMargin).toFixed(3)}) should be material`
  );
});
