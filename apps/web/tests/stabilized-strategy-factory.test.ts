import assert from 'node:assert/strict';
import test from 'node:test';
import { AssetClass, AssetStage } from '@prisma/client';
import {
  buildOfficeAssumptionExtras,
  buildOfficeProvenanceConfig,
  buildOfficeRiskConfig,
  buildOfficeValuationConfig,
  debtDdChecklistItem,
  officeDdChecklistBase
} from '@/lib/services/valuation/stabilized-income-configs';
import {
  buildStabilizedIncomeAssumptions,
  buildStabilizedIncomeDdChecklist,
  buildStabilizedIncomeKeyRisks,
  buildStabilizedIncomeProvenance,
  buildStabilizedIncomeValuation
} from '@/lib/services/valuation/stabilized-income';
import { makeStabilizedStrategy } from '@/lib/services/valuation/strategies/build-stabilized-strategy';
import { buildOfficeValuationAnalysis } from '@/lib/services/valuation/strategies/office';
import { pickBaseScenario } from '@/lib/services/valuation/scenario-utils';
import { applyCreditOverlay } from '@/lib/services/valuation/credit-overlay';
import type { UnderwritingBundle } from '@/lib/services/valuation/types';

// Minimal bundle covering only the fields the income engine reads. Cast through
// `unknown` because the engine touches a subset of the full Prisma shape.
function makeOfficeBundle(): UnderwritingBundle {
  const now = new Date();
  return {
    asset: {
      id: 'factory_office_1',
      assetCode: 'FACTORY-OFFICE-01',
      name: 'Factory Test Office',
      assetClass: AssetClass.OFFICE,
      stage: AssetStage.STABILIZED,
      market: 'KR',
      rentableAreaSqm: 25000,
      grossFloorAreaSqm: 30000,
      stabilizedOccupancyPct: 94,
      occupancyAssumptionPct: 92,
      exitCapRatePct: 4.8,
      purchasePriceKrw: 280000000000,
      currentValuationKrw: null,
      financingLtvPct: 52,
      financingRatePct: 4.9,
      opexAssumptionKrw: 13000000000,
      capexAssumptionKrw: 6000000000
    },
    address: { country: 'KR' },
    marketSnapshot: {
      metroRegion: 'Yeouido',
      vacancyPct: 6,
      capRatePct: 4.7,
      debtCostPct: 4.6,
      sourceStatus: 'MANUAL',
      sourceUpdatedAt: now
    },
    officeDetail: {
      stabilizedRentPerSqmMonthKrw: 38000,
      otherIncomeKrw: 800000000,
      vacancyAllowancePct: 4.5,
      creditLossPct: 1.2,
      tenantImprovementReserveKrw: 1100000000,
      leasingCommissionReserveKrw: 400000000,
      annualCapexReserveKrw: 360000000,
      weightedAverageLeaseTermYears: 4.2
    },
    comparableSet: { entries: [] },
    macroSeries: []
  } as unknown as UnderwritingBundle;
}

test('makeStabilizedStrategy produces a well-shaped analysis for a fake bundle', async () => {
  const strategy = makeStabilizedStrategy({
    assetClassLabel: 'OFFICE',
    valuationConfig: buildOfficeValuationConfig,
    riskConfig: buildOfficeRiskConfig,
    provenanceConfig: buildOfficeProvenanceConfig,
    ddChecklistBase: officeDdChecklistBase,
    assumptionExtras: buildOfficeAssumptionExtras
  });

  const analysis = await strategy(makeOfficeBundle());

  assert.equal(analysis.asset.assetClass, AssetClass.OFFICE);
  assert.equal(analysis.scenarios.length, 3);
  assert.ok(analysis.baseCaseValueKrw > 0);
  assert.ok(typeof analysis.stabilizedNoiKrw === 'number' && analysis.stabilizedNoiKrw > 0);
  assert.equal((analysis.assumptions as Record<string, unknown>).assetClass, 'OFFICE');
  // assumptionExtras wired through
  assert.equal(
    (analysis.assumptions as Record<string, unknown>).weightedAverageLeaseTermYears,
    4.2
  );
  // ddChecklist appends the shared debt item
  assert.equal(analysis.ddChecklist[analysis.ddChecklist.length - 1], debtDdChecklistItem);
  assert.ok(Array.isArray(analysis.provenance) && analysis.provenance.length > 0);
  assert.ok(Array.isArray(analysis.keyRisks) && analysis.keyRisks.length > 0);
  assert.equal(typeof analysis.underwritingMemo, 'string');
});

test('office strategy via factory matches a hand-built reference on key fields', async () => {
  const bundle = makeOfficeBundle();

  // Hand-built reference reproducing the pre-refactor office sequence.
  const valuation = buildStabilizedIncomeValuation(bundle, {}, buildOfficeValuationConfig());
  const baseScenario = pickBaseScenario(valuation.scenarios) ?? valuation.scenarios[0];
  const reference = applyCreditOverlay(
    {
      asset: {
        name: bundle.asset.name,
        assetCode: bundle.asset.assetCode,
        assetClass: bundle.asset.assetClass,
        stage: bundle.asset.stage,
        market: bundle.asset.market
      },
      baseCaseValueKrw: baseScenario.valuationKrw,
      confidenceScore: valuation.confidenceScore,
      underwritingMemo: '',
      keyRisks: buildStabilizedIncomeKeyRisks(bundle, valuation, buildOfficeRiskConfig(bundle)),
      ddChecklist: buildStabilizedIncomeDdChecklist(officeDdChecklistBase, debtDdChecklistItem),
      assumptions: buildStabilizedIncomeAssumptions(
        'OFFICE',
        valuation,
        bundle.comparableSet?.entries.length ?? 0,
        buildOfficeAssumptionExtras(bundle, valuation)
      ),
      provenance: buildStabilizedIncomeProvenance(
        bundle,
        valuation,
        buildOfficeProvenanceConfig(bundle, valuation)
      ),
      scenarios: valuation.scenarios,
      stabilizedNoiKrw: valuation.stabilizedNoiKrw
    },
    bundle,
    valuation.confidenceBounds
  );

  const viaFactory = await buildOfficeValuationAnalysis(bundle);

  assert.equal(viaFactory.baseCaseValueKrw, reference.baseCaseValueKrw);
  assert.equal(viaFactory.confidenceScore, reference.confidenceScore);
  assert.equal(viaFactory.stabilizedNoiKrw, reference.stabilizedNoiKrw);
  assert.deepEqual(viaFactory.keyRisks, reference.keyRisks);
  assert.deepEqual(viaFactory.ddChecklist, reference.ddChecklist);
  assert.deepEqual(viaFactory.scenarios, reference.scenarios);
  // assumptions/provenance contain timestamps in provenance; compare assumptions
  // (deterministic) and provenance length/fields.
  assert.deepEqual(viaFactory.assumptions, reference.assumptions);
  assert.equal(viaFactory.provenance.length, reference.provenance.length);
  assert.deepEqual(
    viaFactory.provenance.map((p) => p.field),
    reference.provenance.map((p) => p.field)
  );
});
