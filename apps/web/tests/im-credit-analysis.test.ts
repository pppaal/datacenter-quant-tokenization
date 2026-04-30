import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildBalanceSheet,
  buildCreditRatios,
  buildIncomeStatement,
  buildStressTest,
  projectFinancials
} from '@/lib/services/im/credit-analysis';

const SAMPLE = {
  fiscalYear: 2025,
  fiscalPeriod: 'FY',
  revenueKrw: 27_060_000_000,
  ebitdaKrw: 8_856_000_000,
  cashKrw: 2_952_000_000,
  totalDebtKrw: 34_440_000_000,
  totalAssetsKrw: 68_880_000_000,
  totalEquityKrw: 29_520_000_000,
  interestExpenseKrw: 1_968_000_000
};

test('buildIncomeStatement computes margin + pre-tax proxy', () => {
  const inc = buildIncomeStatement(SAMPLE);
  assert.equal(inc.revenueKrw, 27_060_000_000);
  assert.equal(inc.ebitdaKrw, 8_856_000_000);
  assert.ok(Math.abs(inc.ebitdaMarginPct! - 32.7327) < 0.01);
  assert.equal(inc.preTaxIncomeProxyKrw, 8_856_000_000 - 1_968_000_000);
});

test('buildBalanceSheet computes net debt + equity ratio + other liabilities', () => {
  const bs = buildBalanceSheet(SAMPLE);
  assert.equal(bs.netDebtKrw, 34_440_000_000 - 2_952_000_000);
  assert.ok(Math.abs(bs.equityRatio! - 29_520_000_000 / 68_880_000_000) < 1e-9);
  // assets 68.88B − debt 34.44B − equity 29.52B = 4.92B other liabilities
  assert.equal(bs.otherLiabilitiesKrw, 4_920_000_000);
});

test('buildCreditRatios returns 8 ratios with values + tones + interpretation', () => {
  const ratios = buildCreditRatios(SAMPLE);
  assert.equal(ratios.length, 8);
  const leverage = ratios.find((r) => r.key === 'leverage')!;
  assert.ok(Math.abs(leverage.value! - 34_440 / 8_856) < 0.01);
  // 3.889 / 4.0 = 0.972, within ±15% of the benchmark → 'warn' band
  assert.equal(leverage.tone, 'warn');
  const coverage = ratios.find((r) => r.key === 'interestCoverage')!;
  assert.ok(Math.abs(coverage.value! - 4.5) < 0.01);
  // 4.5 / 3.0 = 1.5 ≥ 1.15 → 'good'
  assert.equal(coverage.tone, 'good');
  // All ratios carry an interpretation sentence
  for (const r of ratios) {
    assert.ok(typeof r.interpretation === 'string');
    assert.ok(r.interpretation.length > 5);
  }
});

test('buildCreditRatios handles missing inputs gracefully', () => {
  const ratios = buildCreditRatios({ revenueKrw: null, ebitdaKrw: null });
  for (const r of ratios) {
    assert.equal(r.value, null);
    assert.equal(r.tone, null);
    assert.equal(r.interpretation, 'Insufficient inputs.');
  }
});

test('projectFinancials projects horizonYears+1 rows with growth', () => {
  const rows = projectFinancials(SAMPLE, {
    revenueGrowthPct: 5,
    debtAmortizationPct: 4,
    horizonYears: 3
  });
  assert.equal(rows.length, 4);
  assert.equal(rows[0]!.year, '2025A');
  assert.equal(rows[1]!.year, '2026E');
  assert.equal(rows[3]!.year, '2028E');
  // Year-1 revenue ≈ 27.06B × 1.05
  assert.ok(Math.abs(rows[1]!.revenueKrw! - 27_060_000_000 * 1.05) < 1);
  // Year-3 debt ≈ 34.44B × 0.96^3
  assert.ok(
    Math.abs(rows[3]!.totalDebtKrw! - 34_440_000_000 * Math.pow(0.96, 3)) < 1
  );
});

test('projectFinancials returns empty when inputs are missing', () => {
  const rows = projectFinancials({}, {
    revenueGrowthPct: 5,
    debtAmortizationPct: 4,
    horizonYears: 3
  });
  assert.deepEqual(rows, []);
});

test('buildStressTest returns 4 scenarios with covenant pass/fail', () => {
  const rows = buildStressTest(SAMPLE, { ebitdaShockPct: 20, rateShockBps: 200 });
  assert.equal(rows.length, 4);
  // Base case: leverage ≈ 3.89, coverage ≈ 4.5 → passes
  assert.equal(rows[0]!.passesCovenant, true);
  // EBITDA -20%: ebitda → 7.085B, leverage → 4.86 (fails 4.0 covenant)
  assert.equal(rows[1]!.passesCovenant, false);
  assert.ok(Math.abs(rows[1]!.leverage! - 34_440 / (8_856 * 0.8)) < 0.01);
  // Rate +200bps with 100% repriced: incremental interest = 34.44B × 0.02 = 688.8M
  // total interest ≈ 1.968B + 0.6888B = 2.657B; coverage 8.856 / 2.657 ≈ 3.33
  assert.ok(Math.abs(rows[2]!.interestCoverage! - 8856 / 2656.8) < 0.01);
});

test('buildStressTest returns empty when inputs are missing', () => {
  assert.deepEqual(
    buildStressTest({}, { ebitdaShockPct: 20, rateShockBps: 200 }),
    []
  );
});

test('buildIncomeStatement accepts Decimal-shaped inputs', () => {
  const inc = buildIncomeStatement({
    revenueKrw: { toNumber: () => 1000 },
    ebitdaKrw: { toNumber: () => 250 }
  });
  assert.equal(inc.revenueKrw, 1000);
  assert.equal(inc.ebitdaKrw, 250);
  assert.equal(inc.ebitdaMarginPct, 25);
});
