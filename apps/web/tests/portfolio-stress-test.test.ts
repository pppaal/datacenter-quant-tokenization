import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  runPortfolioStressTest,
  fromMonthlyKpis,
  STRESS_SCENARIOS,
  type AssetStressInput
} from '@/lib/services/portfolio/stress-test';

const near = (a: number | null, b: number, eps = 1e-6) => a != null && Math.abs(a - b) < eps;

// NOI 100, value 2000 (cap 5%), debt 1000, base DSCR 1.5 → base debt service 66.667.
const ASSET: AssetStressInput = {
  assetId: 'a1',
  label: 'Yeouido',
  noiKrw: 100,
  opexKrw: 100, // revenue = 200
  valueKrw: 2000,
  debtKrw: 1000,
  baseDscr: 1.5
};

test('base scenario reproduces the base metrics (no shock)', () => {
  const r = runPortfolioStressTest([ASSET], STRESS_SCENARIOS.base);
  const a = r.assets[0]!;
  assert.ok(near(a.stressed.noiKrw, 100), `noi ${a.stressed.noiKrw}`);
  assert.ok(near(a.stressed.capRatePct, 5));
  assert.ok(near(a.stressed.valueKrw, 2000, 1e-3));
  assert.ok(near(a.stressed.dscr, 1.5, 1e-6));
  assert.ok(near(a.stressed.debtYieldPct, 10));
  assert.ok(near(a.stressed.ltvPct, 50, 1e-3));
  assert.equal(a.breachesDscr, false);
});

test('severe scenario cuts NOI/value, raises debt service, breaches DSCR', () => {
  const r = runPortfolioStressTest([ASSET], STRESS_SCENARIOS.severe);
  const a = r.assets[0]!;
  // revenue 200*0.85*0.88=149.6 ; opex 100*1.08=108 ; NOI=41.6
  assert.ok(near(a.stressed.noiKrw, 41.6, 1e-6), `noi ${a.stressed.noiKrw}`);
  // cap 5%+1.5%=6.5% → value 41.6/0.065=640
  assert.ok(near(a.stressed.capRatePct, 6.5));
  assert.ok(near(a.stressed.valueKrw, 640, 1e-3), `value ${a.stressed.valueKrw}`);
  // DS 66.667 + 1000*250/10000(=25) = 91.667 → DSCR 41.6/91.667≈0.4538
  assert.ok(near(a.stressed.debtServiceKrw, 66.6667 + 25, 1e-2));
  assert.ok(a.stressed.dscr != null && a.stressed.dscr < 1.15);
  assert.equal(a.breachesDscr, true);
  // value fell ~68%
  assert.ok(a.valueChangePct != null && a.valueChangePct < -60);
});

test('no-opex fallback flexes NOI directly; zero debt → null debt yield/LTV', () => {
  const r = runPortfolioStressTest(
    [{ assetId: 'a2', noiKrw: 100, valueKrw: 2000, debtKrw: 0, opexKrw: null, baseDscr: null }],
    STRESS_SCENARIOS.severe
  );
  const a = r.assets[0]!;
  // No opex → NOI flexed directly: 100*0.85*0.88 = 74.8
  assert.ok(near(a.stressed.noiKrw, 74.8, 1e-6), `noi ${a.stressed.noiKrw}`);
  assert.equal(a.stressed.debtYieldPct, null); // NOI/0 debt is undefined → null
  assert.equal(a.stressed.ltvPct, 0); // debt 0 over a positive value → 0% LTV
  assert.equal(a.stressed.dscr, null); // no debt service derivable
  assert.equal(a.breachesDscr, false); // null DSCR is not a breach
});

test('portfolio aggregates and counts DSCR breaches', () => {
  const healthy: AssetStressInput = {
    assetId: 'h',
    noiKrw: 100,
    opexKrw: 50,
    valueKrw: 2000,
    debtKrw: 300,
    baseDscr: 3.0
  };
  const r = runPortfolioStressTest([ASSET, healthy], STRESS_SCENARIOS.severe, {
    dscrCovenant: 1.15
  });
  assert.equal(r.assets.length, 2);
  assert.equal(r.portfolio.debtKrw, 1300);
  // ASSET breaches (DSCR ~0.45); healthy at low leverage should not.
  assert.equal(r.assetsBreachingDscr, 1);
  assert.ok(r.portfolio.stressedDscr != null);
  assert.ok(r.portfolio.valueChangePct != null && r.portfolio.valueChangePct < 0);
});

test('fromMonthlyKpis coerces Decimal-like rows and skips rows lacking NOI/value', () => {
  const inputs = fromMonthlyKpis([
    {
      assetId: 'k1',
      label: 'A',
      noiKrw: '100',
      opexKrw: '40',
      debtOutstandingKrw: '500',
      debtServiceCoverage: 1.4,
      navKrw: '1800'
    },
    { assetId: 'k2', noiKrw: 0, navKrw: '1000' }, // skipped: NOI <= 0
    { assetId: 'k3', noiKrw: '50', navKrw: 0 } // skipped: value <= 0
  ]);
  assert.equal(inputs.length, 1);
  assert.equal(inputs[0]!.assetId, 'k1');
  assert.equal(inputs[0]!.noiKrw, 100);
  assert.equal(inputs[0]!.valueKrw, 1800);
  assert.equal(inputs[0]!.debtKrw, 500);
  assert.equal(inputs[0]!.baseDscr, 1.4);
});
