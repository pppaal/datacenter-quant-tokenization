import assert from 'node:assert/strict';
import test from 'node:test';
import { AssetClass, AssetStage, AssetStatus } from '@prisma/client';
import {
  buildOfficeValuationConfig,
  buildRetailValuationConfig
} from '@/lib/services/valuation/stabilized-income-configs';
import {
  buildMixedUseValuationAnalysis,
  buildMixedUseValuationConfig
} from '@/lib/services/valuation/strategies/mixed-use';
import type { UnderwritingBundle } from '@/lib/services/valuation/types';

// Minimal, network- and DB-free bundle. Intentionally omits purchasePriceKrw,
// exitCapRatePct, opexAssumptionKrw, market snapshot, and comps so the MIXED_USE
// config fallbacks (cap rate / opex) are what actually drive the valuation —
// that lets us assert the blend is real rather than copied from one neighbor.
function buildMinimalMixedUseBundle(): UnderwritingBundle {
  const now = new Date();
  return {
    asset: {
      id: 'mixed_asset_1',
      assetCode: 'SEOUL-JUSANGBOKHAP-01',
      slug: 'seoul-jusangbokhap-01-mixed-use-tower',
      name: 'Seoul Mixed-Use Tower (주상복합)',
      assetClass: AssetClass.MIXED_USE,
      assetType: 'Mixed Use',
      assetSubtype: 'Retail podium + office tower',
      market: 'KR',
      status: AssetStatus.UNDER_REVIEW,
      stage: AssetStage.STABILIZED,
      description: 'Mixed-use underwriting case.',
      ownerName: null,
      sponsorName: null,
      developmentSummary: null,
      targetItLoadMw: null,
      powerCapacityMw: null,
      landAreaSqm: 6000,
      grossFloorAreaSqm: 18000,
      rentableAreaSqm: 15000,
      purchasePriceKrw: null,
      occupancyAssumptionPct: null,
      stabilizedOccupancyPct: null,
      tenantAssumption: 'Retail podium, office floors, residential tower',
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
    address: null,
    siteProfile: null,
    buildingSnapshot: null,
    permitSnapshot: null,
    energySnapshot: null,
    marketSnapshot: null,
    comparableSet: null
  };
}

test('mixed-use strategy produces an ordered, positive, blended valuation offline', async () => {
  // No OPENAI_API_KEY in the test env, so generateUnderwritingMemo returns its
  // deterministic fallback string — keeping the full async path offline-safe.
  delete process.env.OPENAI_API_KEY;

  const analysis = await buildMixedUseValuationAnalysis(buildMinimalMixedUseBundle());

  // Positive base case value.
  assert.equal(analysis.asset.assetClass, AssetClass.MIXED_USE);
  assert.ok(analysis.baseCaseValueKrw > 0, 'base case value should be positive');

  // Three scenarios ordered Bull / Base / Bear, monotonically non-increasing.
  assert.equal(analysis.scenarios.length, 3);
  const [bull, base, bear] = analysis.scenarios;
  assert.equal(bull.name, 'Bull');
  assert.equal(base.name, 'Base');
  assert.equal(bear.name, 'Bear');
  assert.ok(bull.valuationKrw >= base.valuationKrw, 'Bull >= Base');
  assert.ok(base.valuationKrw >= bear.valuationKrw, 'Base >= Bear');

  // Confidence score sits within the clamp defined by the mixed-use config.
  assert.ok(
    analysis.confidenceScore >= 4.8 && analysis.confidenceScore <= 9,
    'confidence score within clamp'
  );

  // Memo is the offline fallback (non-empty, no network).
  assert.ok(analysis.underwritingMemo.length > 0);

  // Mixed-use-specific risk language is present.
  assert.ok(
    analysis.keyRisks.some(
      (risk) =>
        risk.toLowerCase().includes('component') ||
        risk.toLowerCase().includes('strata') ||
        risk.toLowerCase().includes('cross-use')
    )
  );
});

test('mixed-use config blends office and retail cap rate and opex (not a copy)', () => {
  const office = buildOfficeValuationConfig();
  const retail = buildRetailValuationConfig();
  const mixed = buildMixedUseValuationConfig();

  // Cap-rate fallback must sit strictly between office (5.5%) and retail (6.1%).
  assert.ok(
    mixed.capRate.fallbackPct > office.capRate.fallbackPct &&
      mixed.capRate.fallbackPct < retail.capRate.fallbackPct,
    `cap rate ${mixed.capRate.fallbackPct} should be between office ${office.capRate.fallbackPct} and retail ${retail.capRate.fallbackPct}`
  );

  // Compare opex ratios by probing the opex function with a fixed gross rent.
  const probeState = { grossPotentialRentKrw: 1_000_000_000, bundle: { asset: {} } };
  const officeOpex = office.annualOpexKrw(probeState as never);
  const retailOpex = retail.annualOpexKrw(probeState as never);
  const mixedOpex = mixed.annualOpexKrw(probeState as never);
  assert.ok(
    mixedOpex > officeOpex && mixedOpex < retailOpex,
    `opex ${mixedOpex} should be between office ${officeOpex} and retail ${retailOpex}`
  );
});
