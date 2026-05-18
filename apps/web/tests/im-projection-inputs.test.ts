import assert from 'node:assert/strict';
import test from 'node:test';
import {
  pickDebtAmortizationPct,
  pickInterestRatePct,
  pickRevenueGrowthPct
} from '@/lib/services/im/projection-inputs';

const MACRO = [
  { seriesKey: 'rent_growth_pct', value: 2.1, unit: '%' },
  { seriesKey: 'debt_cost_pct', value: 5.2, unit: '%' },
  { seriesKey: 'inflation_pct', value: 2.3, unit: '%' }
];

test('pickRevenueGrowthPct uses macro rent_growth_pct when present', () => {
  const r = pickRevenueGrowthPct(MACRO);
  assert.equal(r.value, 2.1);
  assert.match(r.provenance, /rent_growth_pct/);
});

test('pickRevenueGrowthPct falls back to sector default when missing', () => {
  const r = pickRevenueGrowthPct([]);
  assert.equal(r.value, 3.0);
  assert.match(r.provenance, /fallback/);
});

test('pickDebtAmortizationPct derives yearly amort from facility schedule', () => {
  // 84 months term, 15% balloon → 7-year amort of 85% → 12.14%/yr
  const r = pickDebtAmortizationPct([
    {
      commitmentKrw: 100_000_000_000,
      amortizationTermMonths: 84,
      balloonPct: 15
    }
  ]);
  assert.ok(Math.abs(r.value - (85 / 7)) < 0.01);
  assert.match(r.provenance, /facility schedule/);
});

test('pickDebtAmortizationPct weights by commitment when multiple facilities', () => {
  // facility A: 100B, 84mo, 15% balloon → 12.14%/yr
  // facility B: 50B, 60mo, 0% balloon → 20%/yr
  // weighted by commitment: (12.14*100 + 20*50)/(100+50) = (1214 + 1000)/150 = 14.76
  const r = pickDebtAmortizationPct([
    { commitmentKrw: 100, amortizationTermMonths: 84, balloonPct: 15 },
    { commitmentKrw: 50, amortizationTermMonths: 60, balloonPct: 0 }
  ]);
  const expected = (((85 / 7) * 100) + (20 * 50)) / 150;
  assert.ok(Math.abs(r.value - expected) < 0.01);
});

test('pickDebtAmortizationPct falls back to sector default when no facility', () => {
  const r = pickDebtAmortizationPct(null);
  assert.equal(r.value, 5.0);
  assert.match(r.provenance, /fallback/);
});

test('pickInterestRatePct prefers facility commitment-weighted rate', () => {
  const r = pickInterestRatePct(
    [
      { commitmentKrw: 100, interestRatePct: 5.4 },
      { commitmentKrw: 50, interestRatePct: 6.5 }
    ],
    MACRO
  );
  // (5.4*100 + 6.5*50)/150 = 5.7666...
  assert.ok(Math.abs(r.value - (5.4 * 100 + 6.5 * 50) / 150) < 0.01);
  assert.match(r.provenance, /facility rate/);
});

test('pickInterestRatePct falls back to macro debt_cost_pct when no facility rate', () => {
  const r = pickInterestRatePct([], MACRO);
  assert.equal(r.value, 5.2);
  assert.match(r.provenance, /debt_cost_pct/);
});

test('pickInterestRatePct falls back to sector default when nothing on file', () => {
  const r = pickInterestRatePct([], []);
  assert.equal(r.value, 5.0);
  assert.match(r.provenance, /fallback/);
});
