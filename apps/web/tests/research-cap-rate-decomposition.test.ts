import assert from 'node:assert/strict';
import test from 'node:test';
import {
  decomposeCapRate,
  estimateSubmarketSpread
} from '@/lib/services/research/cap-rate-decomposition';

test('decomposeCapRate produces all 6 components', () => {
  const result = decomposeCapRate({
    riskFreeRatePct: 3.5,
    equityRiskPremiumPct: 5.0,
    sectorBeta: 0.45,
    submarketSpreadPct: 0.3,
    growthExpectationPct: 2.0,
    transactionVolumeIndex: 100,
    vintageYear: 2020,
    referenceYear: 2026
  });
  assert.equal(result.components.length, 6);
  const keys = result.components.map((c) => c.key).sort();
  assert.deepEqual(keys, [
    'growth',
    'liquidity',
    'obsolescence',
    'riskFree',
    'sectorPremium',
    'submarketSpread'
  ]);
});

test('decomposeCapRate signs sum correctly (cap rate = + + + - + +)', () => {
  // RFR 3.5 + ERP 5.0 × beta 0.45 = 2.25
  // Submarket +0.3
  // Growth 2.0 (subtracted)
  // Liquidity 0 (index = 100 → no penalty)
  // Obsolescence (2026-2020) × 0.05 = 0.30
  // Total = 3.5 + 2.25 + 0.3 - 2.0 + 0 + 0.30 = 4.35
  const result = decomposeCapRate({
    riskFreeRatePct: 3.5,
    equityRiskPremiumPct: 5.0,
    sectorBeta: 0.45,
    submarketSpreadPct: 0.3,
    growthExpectationPct: 2.0,
    transactionVolumeIndex: 100,
    vintageYear: 2020,
    referenceYear: 2026
  });
  assert.ok(Math.abs(result.capRatePct - 4.35) < 0.01);
});

test('decomposeCapRate liquidity penalty for thin markets', () => {
  // index = 60 → penalty = (100-60)/100 × 1.0 = 0.4
  const thinMarket = decomposeCapRate({
    riskFreeRatePct: 3.5,
    equityRiskPremiumPct: 5.0,
    sectorBeta: 0.45,
    submarketSpreadPct: 0,
    growthExpectationPct: 2.0,
    transactionVolumeIndex: 60,
    vintageYear: 2020,
    referenceYear: 2026
  });
  const liquidComp = thinMarket.components.find((c) => c.key === 'liquidity')!;
  assert.ok(liquidComp.pct > 0);
  assert.ok(Math.abs(liquidComp.pct - 0.4) < 0.01);
});

test('decomposeCapRate liquidity tightens for deep markets', () => {
  // index = 140 → discount = (100-140)/100 × 1.0 = -0.4
  const deepMarket = decomposeCapRate({
    riskFreeRatePct: 3.5,
    equityRiskPremiumPct: 5.0,
    sectorBeta: 0.45,
    submarketSpreadPct: 0,
    growthExpectationPct: 2.0,
    transactionVolumeIndex: 140,
    vintageYear: 2020,
    referenceYear: 2026
  });
  const liquidComp = deepMarket.components.find((c) => c.key === 'liquidity')!;
  assert.ok(liquidComp.pct < 0);
  assert.equal(liquidComp.sign, '-');
});

test('decomposeCapRate obsolescence ramps with age', () => {
  const newAsset = decomposeCapRate({
    riskFreeRatePct: 3.5,
    equityRiskPremiumPct: 5.0,
    sectorBeta: 0.45,
    submarketSpreadPct: 0,
    growthExpectationPct: 2.0,
    transactionVolumeIndex: 100,
    vintageYear: 2026,
    referenceYear: 2026
  });
  const oldAsset = decomposeCapRate({
    riskFreeRatePct: 3.5,
    equityRiskPremiumPct: 5.0,
    sectorBeta: 0.45,
    submarketSpreadPct: 0,
    growthExpectationPct: 2.0,
    transactionVolumeIndex: 100,
    vintageYear: 1996,
    referenceYear: 2026
  });
  const newOb = newAsset.components.find((c) => c.key === 'obsolescence')!;
  const oldOb = oldAsset.components.find((c) => c.key === 'obsolescence')!;
  assert.equal(newOb.pct, 0);
  assert.ok(Math.abs(oldOb.pct - 1.5) < 0.01); // 30 yrs × 0.05
  assert.ok(oldAsset.capRatePct > newAsset.capRatePct);
});

test('estimateSubmarketSpread returns 0 for empty input', () => {
  const r = estimateSubmarketSpread({ comps: [], targetSubmarket: 'X' });
  assert.equal(r.spreadPct, 0);
  assert.equal(r.targetCount, 0);
});

test('estimateSubmarketSpread captures spread vs KR mean', () => {
  const comps = [
    { submarket: 'CBD', capRatePct: 4.0 },
    { submarket: 'CBD', capRatePct: 4.2 },
    { submarket: 'CBD', capRatePct: 4.1 },
    { submarket: 'YEOUIDO', capRatePct: 5.5 },
    { submarket: 'YEOUIDO', capRatePct: 5.7 },
    { submarket: 'YEOUIDO', capRatePct: 5.6 }
  ];
  // KR mean = (4.0+4.2+4.1+5.5+5.7+5.6)/6 = 4.85
  // CBD mean = 4.1; spread vs KR = -0.75 (full weight)
  const cbd = estimateSubmarketSpread({
    comps,
    targetSubmarket: 'CBD'
  });
  assert.ok(Math.abs(cbd.spreadPct - -0.75) < 0.01);
  assert.equal(cbd.targetCount, 3);
  assert.ok(Math.abs(cbd.krMeanPct - 4.85) < 0.01);

  const yeouido = estimateSubmarketSpread({
    comps,
    targetSubmarket: 'YEOUIDO'
  });
  assert.ok(Math.abs(yeouido.spreadPct - 0.75) < 0.01);
});

test('estimateSubmarketSpread shrinks toward 0 with thin sample', () => {
  // Only 1 comp in target submarket; minComps = 3 → 1/3 weight
  const comps = [
    { submarket: 'A', capRatePct: 4.0 },
    { submarket: 'A', capRatePct: 4.2 },
    { submarket: 'A', capRatePct: 4.1 },
    { submarket: 'B', capRatePct: 5.5 } // single B comp
  ];
  // Mean = 4.45, B raw spread = 1.05, shrunk × 1/3 = 0.35
  const b = estimateSubmarketSpread({
    comps,
    targetSubmarket: 'B',
    minComps: 3
  });
  assert.equal(b.targetCount, 1);
  assert.ok(b.spreadPct < 1.05); // shrunken
  assert.ok(b.spreadPct > 0); // still positive
});

test('estimateSubmarketSpread returns 0 spread for missing submarket', () => {
  const r = estimateSubmarketSpread({
    comps: [{ submarket: 'A', capRatePct: 4.0 }],
    targetSubmarket: 'NONEXISTENT'
  });
  assert.equal(r.spreadPct, 0);
  assert.equal(r.targetCount, 0);
  assert.equal(r.krMeanPct, 4.0);
});
