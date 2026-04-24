import assert from 'node:assert/strict';
import test from 'node:test';
import { computeAnnualJongbuseKrw } from '@/lib/services/valuation/jongbuse';

test('MULTIFAMILY applies 2.7% flat to 공시가격', () => {
  const result = computeAnnualJongbuseKrw({
    assetClass: 'MULTIFAMILY',
    purchasePriceKrw: 10_000_000_000,
    landValuePct: 20
  });
  assert.equal(result.method, 'RESIDENTIAL_CORP');
  // 100억 × 65% = 65억 공시가격 × 2.7% = 175.5백만
  assert.equal(result.annualJongbuseKrw, 175_500_000);
});

test('INDUSTRIAL is exempt', () => {
  const result = computeAnnualJongbuseKrw({
    assetClass: 'INDUSTRIAL',
    purchasePriceKrw: 50_000_000_000,
    landValuePct: 40
  });
  assert.equal(result.method, 'EXEMPT');
  assert.equal(result.annualJongbuseKrw, 0);
});

test('OFFICE below 80억 land threshold pays zero 종부세', () => {
  // 50억 × 65% = 32.5억 공시가격, land 25% = 8.125억 land — well below 80억 공제
  const result = computeAnnualJongbuseKrw({
    assetClass: 'OFFICE',
    purchasePriceKrw: 5_000_000_000,
    landValuePct: 25
  });
  assert.equal(result.method, 'SEPARATE_LAND');
  assert.equal(result.annualJongbuseKrw, 0);
});

test('OFFICE above threshold pays progressive', () => {
  // 2000억 × 65% = 1300억 공시가격, land 25% = 325억. Taxable = 325 - 80 = 245억.
  // Bracket 1: 60억 × 0.5% = 30M; Bracket 2: 140억 × 0.6% = 84M; Bracket 3: 45억 × 0.7% = 31.5M
  // Total ≈ 145.5M
  const result = computeAnnualJongbuseKrw({
    assetClass: 'OFFICE',
    purchasePriceKrw: 200_000_000_000,
    landValuePct: 25
  });
  assert.equal(result.method, 'SEPARATE_LAND');
  assert.ok(result.annualJongbuseKrw > 100_000_000);
  assert.ok(result.annualJongbuseKrw < 200_000_000);
});

test('LAND uses 종합합산 brackets with 5억 공제', () => {
  // 30억 × 65% = 19.5억 land (95% land), taxable = 19.5 - 5 = 14.5억
  // Bracket 1: 14.5억 × 1.0% = 14.5M
  const result = computeAnnualJongbuseKrw({
    assetClass: 'LAND',
    purchasePriceKrw: 3_000_000_000,
    landValuePct: 95
  });
  assert.equal(result.method, 'GENERAL_LAND');
  assert.ok(result.annualJongbuseKrw > 10_000_000);
  assert.ok(result.annualJongbuseKrw < 20_000_000);
});

test('override bypasses computation', () => {
  const result = computeAnnualJongbuseKrw({
    assetClass: 'OFFICE',
    purchasePriceKrw: 10_000_000_000,
    landValuePct: 25,
    overrideAnnualKrw: 42_000_000
  });
  assert.equal(result.method, 'OVERRIDE');
  assert.equal(result.annualJongbuseKrw, 42_000_000);
});

test('assessment ratio scales the base', () => {
  const low = computeAnnualJongbuseKrw({
    assetClass: 'MULTIFAMILY',
    purchasePriceKrw: 10_000_000_000,
    landValuePct: 20,
    assessmentRatio: 0.5
  });
  const high = computeAnnualJongbuseKrw({
    assetClass: 'MULTIFAMILY',
    purchasePriceKrw: 10_000_000_000,
    landValuePct: 20,
    assessmentRatio: 0.8
  });
  assert.ok(high.annualJongbuseKrw > low.annualJongbuseKrw);
  // Proportional (2.7% flat × ratio)
  assert.equal(low.annualJongbuseKrw, Math.round(10_000_000_000 * 0.5 * 0.027));
  assert.equal(high.annualJongbuseKrw, Math.round(10_000_000_000 * 0.8 * 0.027));
});
