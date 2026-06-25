import assert from 'node:assert/strict';
import test from 'node:test';
import { fitHedonic, type CompRow } from '@/lib/services/research/hedonic';

/**
 * OLS inference + conditioning guard coverage (2026-06 quant audit).
 *
 * The reference values for the simple-regression case below are derived
 * from the closed form of OLS on a 5-point design with two parameters
 * (intercept + ln_size), so df = n − k = 3:
 *
 *   sizes  = [1000, 2000, 4000, 8000, 16000]   → x = ln(size)
 *   prices = [1_000_000, 900_000, 810_000, 750_000, 700_000] → y = ln(price)
 *
 *   β̂₀ = 14.69516397497846   β̂₁ = -0.1292180751493308
 *   RSS = 0.0007710012629482982   σ̂² = RSS/3 = 0.0002570004209827661
 *   (XᵀX)⁻¹₀₀ = 14.517999354706529   (XᵀX)⁻¹₁₁ = 0.20813689810055952
 *   SE₀ = sqrt(σ̂²·(XᵀX)⁻¹₀₀) = 0.06108299228088866
 *   SE₁ = sqrt(σ̂²·(XᵀX)⁻¹₁₁) = 0.007313772653965317
 *   t₀ = β̂₀/SE₀ = 240.577015405583    t₁ = β̂₁/SE₁ = -17.667773017154488
 *   p₀ = 1.583730698796516e-7          p₁ = 0.00039531126162887126
 *   VIF(ln_size) = 1 (no other regressor to inflate against)
 *
 * These are exact closed-form numbers (normal equations + the
 * regularised-incomplete-beta Student-t CDF), independently reproduced
 * outside the implementation.
 */

function comp(args: Partial<CompRow> & { pricePerSqmKrw: number; sizeSqm: number }): CompRow {
  return {
    submarket: 'A',
    tier: 'A',
    dealStructure: 'A',
    vintageYear: 2018,
    ...args
  };
}

test('fitHedonic: per-coefficient SE / t / p match the closed form (simple regression)', () => {
  const sizes = [1000, 2000, 4000, 8000, 16000];
  const prices = [1_000_000, 900_000, 810_000, 750_000, 700_000];
  const rows: CompRow[] = sizes.map((s, i) => comp({ sizeSqm: s, pricePerSqmKrw: prices[i]! }));

  const fit = fitHedonic(rows, { sizeSqm: 4000, submarket: 'A', tier: 'A', dealStructure: 'A' });
  assert.ok(fit, 'expected a fit');
  // Design collapses to [intercept, ln_size] (single category each, vintage constant).
  assert.equal(fit!.p, 2);
  assert.equal(fit!.n, 5);

  const inf = fit!.inference;
  assert.ok(inf, 'expected inference block');
  const intercept = inf!.intercept!;
  const lnSize = inf!.ln_size!;

  // estimate mirrors the point estimate exactly.
  assert.equal(intercept.estimate, fit!.coefficients.intercept);
  assert.equal(lnSize.estimate, fit!.coefficients.ln_size);

  // Standard errors.
  assert.ok(Math.abs(intercept.standardError! - 0.06108299228088866) < 1e-10);
  assert.ok(Math.abs(lnSize.standardError! - 0.007313772653965317) < 1e-10);

  // t-statistics.
  assert.ok(Math.abs(intercept.tStatistic! - 240.577015405583) < 1e-6);
  assert.ok(Math.abs(lnSize.tStatistic! - -17.667773017154488) < 1e-9);

  // Two-sided p-values from the exact Student-t (df = 3).
  assert.ok(Math.abs(intercept.pValue! - 1.583730698796516e-7) < 1e-12);
  assert.ok(Math.abs(lnSize.pValue! - 0.00039531126162887126) < 1e-10);

  // VIF: ln_size has no co-regressor, so VIF == 1; intercept VIF is null.
  assert.equal(intercept.vif, null);
  assert.ok(Math.abs(lnSize.vif! - 1) < 1e-9);

  // Healthy design → well conditioned, no warnings.
  assert.equal(fit!.wellConditioned, true);
  assert.deepEqual(fit!.warnings, []);
  assert.ok(Number.isFinite(fit!.conditionNumber!) && fit!.conditionNumber! > 0);
});

test('fitHedonic: a deliberately collinear design sets wellConditioned=false', () => {
  // submarket and tier are almost perfectly aligned: A↔X, B↔Y, except a
  // single "breaking" row. The two dummy columns are near-collinear, so
  // (XᵀX) is near-singular → inflated VIF / large condition number, while
  // R² can still look high. The guard must catch this.
  const rows: CompRow[] = [];
  for (let i = 0; i < 40; i += 1) {
    const groupA = i % 2 === 0;
    rows.push(
      comp({
        sizeSqm: 1000 + i * 100,
        pricePerSqmKrw: 1_000_000 + i * 10_000,
        submarket: groupA ? 'A' : 'B',
        tier: groupA ? 'X' : 'Y'
      })
    );
  }
  // One breaking row to avoid EXACT singularity (which would return null):
  // submarket A paired with tier Y. With 40 perfectly-aligned rows the two
  // dummy columns are still near-collinear (VIF ≈ 11).
  rows.push(comp({ sizeSqm: 5000, pricePerSqmKrw: 1_300_000, submarket: 'A', tier: 'Y' }));

  const fit = fitHedonic(rows, { sizeSqm: 3000, submarket: 'A', tier: 'X' });
  assert.ok(fit, 'near-singular (not exactly singular) design should still fit');
  assert.equal(fit!.wellConditioned, false);
  assert.ok(fit!.warnings && fit!.warnings.length > 0);

  // The collinear dummies must show a high VIF (≥ the documented threshold).
  const maxVif = Math.max(
    ...Object.values(fit!.inference!)
      .map((c) => c.vif ?? 0)
      .filter((v) => Number.isFinite(v))
  );
  assert.ok(maxVif >= 10, `expected an inflated VIF, got ${maxVif}`);
});

test('fitHedonic: a healthy multi-feature design stays wellConditioned=true', () => {
  // Two clearly-separated submarkets, varied sizes — no collinearity.
  const rows: CompRow[] = [];
  for (let i = 1; i <= 15; i += 1) {
    rows.push(comp({ sizeSqm: i * 500, pricePerSqmKrw: 1_500_000, submarket: 'CBD', tier: 'A' }));
    rows.push(
      comp({ sizeSqm: i * 500, pricePerSqmKrw: 1_000_000, submarket: 'YEOUIDO', tier: 'A' })
    );
  }
  const fit = fitHedonic(rows, { sizeSqm: 3000, submarket: 'CBD', tier: 'A' });
  assert.ok(fit);
  assert.equal(fit!.wellConditioned, true);
  assert.deepEqual(fit!.warnings, []);
  // Every non-intercept VIF is well under the threshold.
  for (const [name, c] of Object.entries(fit!.inference!)) {
    if (name === 'intercept') continue;
    assert.ok((c.vif ?? 0) < 10, `${name} VIF should be low, got ${c.vif}`);
  }
});

test('fitHedonic: existing fields/behaviour unchanged for the healthy case', () => {
  // Mirrors the legacy "recovers ln-linear size relationship" expectation.
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
  // Legacy fields still present and correct.
  assert.ok(Math.abs(fit!.coefficients.ln_size! - -0.5) < 0.01);
  assert.ok(fit!.rSquared > 0.99);
  assert.ok(Math.abs(fit!.fittedPricePerSqmKrw - 100_000 / Math.sqrt(5000)) < 1);
  assert.equal(fit!.n, 30);
  assert.ok(fit!.p >= 2);
  assert.ok(fit!.residualStdErr >= 0);
  assert.ok(fit!.adjustedRSquared <= fit!.rSquared);
  // Additive fields exist.
  assert.ok(fit!.inference);
  assert.equal(fit!.wellConditioned, true);
});
