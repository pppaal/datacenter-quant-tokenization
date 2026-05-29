import assert from 'node:assert/strict';
import test from 'node:test';
import { AssetClass, AssetStage, AssetStatus, SourceStatus } from '@prisma/client';
import { buildLandValuationAnalysis } from '@/lib/services/valuation/strategies/land';
import type { UnderwritingBundle } from '@/lib/services/valuation/types';

const NOW = new Date();

function buildLandBundle(
  overrides: {
    landAreaSqm?: number | null;
    purchasePriceKrw?: number | null;
    transactionComps?: UnderwritingBundle['transactionComps'];
  } = {}
): UnderwritingBundle {
  return {
    asset: {
      id: 'land_asset_1',
      assetCode: 'GG-LAND-01',
      slug: 'gg-land-01-development-parcel',
      name: 'Gyeonggi Development Land Parcel',
      assetClass: AssetClass.LAND,
      assetType: 'Land',
      assetSubtype: 'Development Parcel',
      market: 'KR',
      status: AssetStatus.UNDER_REVIEW,
      stage: AssetStage.LAND_SECURED,
      description: 'Vacant development land underwriting case.',
      ownerName: null,
      sponsorName: null,
      developmentSummary: null,
      targetItLoadMw: null,
      powerCapacityMw: null,
      landAreaSqm: overrides.landAreaSqm === undefined ? 20_000 : overrides.landAreaSqm,
      grossFloorAreaSqm: null,
      rentableAreaSqm: null,
      purchasePriceKrw:
        overrides.purchasePriceKrw === undefined ? null : overrides.purchasePriceKrw,
      occupancyAssumptionPct: null,
      stabilizedOccupancyPct: null,
      tenantAssumption: null,
      capexAssumptionKrw: null,
      opexAssumptionKrw: null,
      financingLtvPct: null,
      financingRatePct: null,
      holdingPeriodYears: null,
      exitCapRatePct: null,
      currentValuationKrw: null,
      lastEnrichedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW
    },
    address: null,
    siteProfile: {
      id: 'land_site_1',
      assetId: 'land_asset_1',
      gridAvailability: 'Adjacent feeder available',
      fiberAccess: 'Carrier access nearby',
      latencyProfile: 'n/a',
      floodRiskScore: 1.2,
      wildfireRiskScore: 0.2,
      seismicRiskScore: 0.4,
      siteNotes: 'Flat parcel near interchange.',
      sourceStatus: SourceStatus.MANUAL,
      sourceUpdatedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW
    },
    buildingSnapshot: null,
    permitSnapshot: null,
    energySnapshot: null,
    marketSnapshot: null,
    transactionComps: overrides.transactionComps ?? []
  };
}

test('land valuation values area x per-sqm via comparables with ordered scenarios', async () => {
  const areaSqm = 20_000;
  const compPerSqm = [3_000_000, 3_400_000]; // average 3,200,000 KRW/sqm
  const bundle = buildLandBundle({
    landAreaSqm: areaSqm,
    transactionComps: compPerSqm.map((pricePerSqmKrw, index) => ({
      id: `land_txn_${index}`,
      assetId: 'land_asset_1',
      market: 'KR',
      region: 'Gyeonggi',
      assetClass: AssetClass.LAND,
      assetTier: null,
      comparableType: 'land',
      transactionDate: NOW,
      priceKrw: null,
      pricePerSqmKrw,
      pricePerMwKrw: null,
      capRatePct: null,
      buyerType: null,
      sellerType: null,
      sourceLink: null,
      sourceSystem: 'manual',
      sourceStatus: SourceStatus.MANUAL,
      createdAt: NOW,
      updatedAt: NOW
    }))
  });

  const analysis = await buildLandValuationAnalysis(bundle);

  const expectedPerSqm = (compPerSqm[0] + compPerSqm[1]) / 2;
  const expectedBase = areaSqm * expectedPerSqm;

  assert.equal(analysis.asset.assetClass, AssetClass.LAND);
  assert.ok(analysis.baseCaseValueKrw > 0);
  // Within rounding tolerance of area x per-sqm.
  assert.ok(Math.abs(analysis.baseCaseValueKrw - expectedBase) <= 10);

  // Three scenarios ordered Bull >= Base >= Bear.
  assert.equal(analysis.scenarios.length, 3);
  const [bull, base, bear] = analysis.scenarios;
  assert.equal(bull.name, 'Bull');
  assert.equal(base.name, 'Base');
  assert.equal(bear.name, 'Bear');
  assert.ok(bull.valuationKrw >= base.valuationKrw);
  assert.ok(base.valuationKrw >= bear.valuationKrw);

  // Non-income land: no running yield and no debt service coverage.
  for (const scenario of analysis.scenarios) {
    assert.equal(scenario.impliedYieldPct, 0);
    assert.equal(scenario.debtServiceCoverage, 0);
  }

  // Confidence respects the engine clamp and reflects comparable backing.
  assert.ok(analysis.confidenceScore >= 4.5 && analysis.confidenceScore <= 9.9);

  // Assumptions record the derivation.
  const assumptions = analysis.assumptions as Record<string, unknown>;
  assert.equal(assumptions.assetClass, 'LAND');
  assert.equal(assumptions.landAreaSqm, areaSqm);
  assert.equal(assumptions.valueSourceTier, 'comparable');
  assert.equal(assumptions.incomeProducing, false);

  // Land-specific risks present.
  assert.ok(
    analysis.keyRisks.some(
      (risk) => risk.toLowerCase().includes('entitlement') || risk.toLowerCase().includes('zoning')
    )
  );

  // A deterministic memo is produced offline (no OPENAI_API_KEY in tests).
  assert.ok(analysis.underwritingMemo.length > 0);
});

test('land valuation falls back to purchase-price-implied per-sqm with lower confidence', async () => {
  const areaSqm = 10_000;
  const purchasePriceKrw = 18_000_000_000; // implies 1,800,000 KRW/sqm
  const bundle = buildLandBundle({ landAreaSqm: areaSqm, purchasePriceKrw });

  const analysis = await buildLandValuationAnalysis(bundle);

  assert.ok(analysis.baseCaseValueKrw > 0);
  assert.ok(Math.abs(analysis.baseCaseValueKrw - purchasePriceKrw) <= 10);

  const assumptions = analysis.assumptions as Record<string, unknown>;
  assert.equal(assumptions.valueSourceTier, 'gongsijiga_or_purchase');
  assert.equal(assumptions.comparableCount, 0);

  // No-comparables case still returns a value via fallback at lower confidence.
  assert.ok(analysis.confidenceScore < 6.8);
  assert.ok(analysis.confidenceScore >= 4.5);
});

test('land valuation uses conservative regional fallback when no comps or price', async () => {
  const areaSqm = 5_000;
  const bundle = buildLandBundle({ landAreaSqm: areaSqm, purchasePriceKrw: null });

  const analysis = await buildLandValuationAnalysis(bundle);

  const assumptions = analysis.assumptions as Record<string, unknown>;
  assert.equal(assumptions.valueSourceTier, 'regional_fallback');
  assert.ok(analysis.baseCaseValueKrw > 0);
  // Regional fallback is the lowest-confidence tier.
  assert.ok(analysis.confidenceScore <= 4.9);
});
