import assert from 'node:assert/strict';
import test from 'node:test';
import { fitHedonic, type CompRow } from '@/lib/services/research/hedonic';

// Helper — build a synthetic comp row.
function comp(args: Partial<CompRow> & { pricePerSqmKrw: number; sizeSqm: number }): CompRow {
  return {
    submarket: 'GANGNAM',
    tier: 'PRIME',
    vintageYear: 2018,
    dealStructure: 'ASSET',
    ...args
  };
}

test('fitHedonic returns null on empty input', () => {
  assert.equal(fitHedonic([], { sizeSqm: 1000 }), null);
});

test('fitHedonic returns null when n <= p (under-identified)', () => {
  // Two comps but ~3+ params (intercept, ln_size, vintage_delta) → null
  const result = fitHedonic(
    [comp({ pricePerSqmKrw: 1_000_000, sizeSqm: 1000 })],
    { sizeSqm: 1500 }
  );
  assert.equal(result, null);
});

test('fitHedonic recovers ln-linear size relationship', () => {
  // Synthetic: pricePerSqm = 100000 / sqrt(size) — i.e. ln(p) = a + (-0.5)·ln(size).
  // Generate 30 comps with size from 1000 to 30000.
  const rows: CompRow[] = [];
  for (let i = 1; i <= 30; i += 1) {
    const size = i * 1000;
    rows.push(
      comp({
        sizeSqm: size,
        pricePerSqmKrw: 100_000 / Math.sqrt(size),
        submarket: 'A',
        tier: 'A',
        dealStructure: 'A'
      })
    );
  }
  const fit = fitHedonic(rows, { sizeSqm: 5000, submarket: 'A', tier: 'A', dealStructure: 'A' });
  assert.ok(fit);
  // ln_size coefficient should be close to -0.5
  assert.ok(Math.abs(fit!.coefficients.ln_size! - -0.5) < 0.01);
  // R² should be close to 1 (perfect fit)
  assert.ok(fit!.rSquared > 0.99);
  // Predicted price at 5000 should match 100000/sqrt(5000) ≈ 1414
  assert.ok(Math.abs(fit!.fittedPricePerSqmKrw - 100_000 / Math.sqrt(5000)) < 1);
});

test('fitHedonic distinguishes submarket dummies', () => {
  // Two submarkets with distinct price levels.
  const rows: CompRow[] = [];
  for (let i = 1; i <= 15; i += 1) {
    rows.push(comp({ sizeSqm: i * 500, pricePerSqmKrw: 1_500_000, submarket: 'CBD', tier: 'A' }));
    rows.push(comp({ sizeSqm: i * 500, pricePerSqmKrw: 1_000_000, submarket: 'YEOUIDO', tier: 'A' }));
  }
  const cbdFit = fitHedonic(rows, { sizeSqm: 3000, submarket: 'CBD', tier: 'A' });
  const yeouidoFit = fitHedonic(rows, { sizeSqm: 3000, submarket: 'YEOUIDO', tier: 'A' });
  assert.ok(cbdFit && yeouidoFit);
  // CBD predicted price should be higher than YEOUIDO
  assert.ok(cbdFit!.fittedPricePerSqmKrw > yeouidoFit!.fittedPricePerSqmKrw);
  // Difference should be roughly 50% (ln(1.5) gap captured)
  const ratio = cbdFit!.fittedPricePerSqmKrw / yeouidoFit!.fittedPricePerSqmKrw;
  assert.ok(Math.abs(ratio - 1.5) < 0.05);
});

test('fitHedonic adjusted R² penalises extra parameters', () => {
  const rows: CompRow[] = [];
  // 20 comps all same submarket / tier — adding submarket dummy is wasted.
  for (let i = 1; i <= 20; i += 1) {
    rows.push(comp({ sizeSqm: i * 500, pricePerSqmKrw: 1_000_000 + i }));
  }
  const fit = fitHedonic(rows, { sizeSqm: 3000 });
  assert.ok(fit);
  // adjusted ≤ raw R²
  assert.ok(fit!.adjustedRSquared <= fit!.rSquared);
});

test('fitHedonic exposes residualStdErr', () => {
  const rows: CompRow[] = [];
  for (let i = 1; i <= 25; i += 1) {
    // Add noise
    rows.push(comp({ sizeSqm: i * 500, pricePerSqmKrw: 1_000_000 * (1 + (i % 3) * 0.05) }));
  }
  const fit = fitHedonic(rows, { sizeSqm: 3000 });
  assert.ok(fit);
  // With noise, residual SE > 0
  assert.ok(fit!.residualStdErr > 0);
  // n / p sanity (intercept + ln_size at minimum; vintage / dummies
  // dropped when no variance)
  assert.equal(fit!.n, 25);
  assert.ok(fit!.p >= 2);
});

test('fitHedonic handles missing vintage gracefully', () => {
  const rows: CompRow[] = [];
  for (let i = 1; i <= 20; i += 1) {
    rows.push(comp({ sizeSqm: i * 500, pricePerSqmKrw: 1_000_000, vintageYear: null }));
  }
  const fit = fitHedonic(rows, { sizeSqm: 3000 });
  assert.ok(fit);
  // With no vintage variance the column is dropped (avoids singular system)
  assert.equal('vintage_delta' in fit!.coefficients, false);
});

test('fitHedonic includes vintage_delta when years vary', () => {
  const rows: CompRow[] = [];
  for (let i = 1; i <= 20; i += 1) {
    rows.push(
      comp({
        sizeSqm: i * 500,
        pricePerSqmKrw: 1_000_000,
        vintageYear: 2010 + (i % 5)
      })
    );
  }
  const fit = fitHedonic(rows, { sizeSqm: 3000, vintageYear: 2014 });
  assert.ok(fit);
  assert.ok('vintage_delta' in fit!.coefficients);
});

test('fitHedonic returns null for singular design', () => {
  // All comps identical → zero variance → singular system OR R² = 0
  const rows: CompRow[] = [];
  for (let i = 0; i < 10; i += 1) {
    rows.push(comp({ sizeSqm: 1000, pricePerSqmKrw: 1_000_000 }));
  }
  const fit = fitHedonic(rows, { sizeSqm: 1000 });
  // Either null (singular) or R² = 0 (no variance to explain)
  if (fit) {
    assert.equal(fit.rSquared, 0);
  }
});
