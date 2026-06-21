import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assessFinancialFreshness,
  computeCreditTrend,
  detectMarginalFirm,
  gradeToSpreadBps,
  summarizePeerPositioning
} from '@/lib/services/credit/insights';

test('detectMarginalFirm: 3 consecutive ICR<1 → 한계기업', () => {
  const r = detectMarginalFirm([
    { fiscalYear: 2024, operatingIncomeKrw: 80, interestExpenseKrw: 100 }, // 0.8
    { fiscalYear: 2025, operatingIncomeKrw: 90, interestExpenseKrw: 100 }, // 0.9
    { fiscalYear: 2026, operatingIncomeKrw: 70, interestExpenseKrw: 100 } // 0.7
  ]);
  assert.equal(r.isMarginalFirm, true);
  assert.equal(r.consecutiveSubOneYears, 3);
  assert.deepEqual(
    r.icrByYear.map((y) => y.icr),
    [0.8, 0.9, 0.7]
  );
});

test('detectMarginalFirm: a broken run is NOT 한계기업 (fixes the single-year mislabel)', () => {
  const r = detectMarginalFirm([
    { fiscalYear: 2024, operatingIncomeKrw: 80, interestExpenseKrw: 100 }, // 0.8
    { fiscalYear: 2025, operatingIncomeKrw: 200, interestExpenseKrw: 100 }, // 2.0 (breaks)
    { fiscalYear: 2026, operatingIncomeKrw: 90, interestExpenseKrw: 100 } // 0.9
  ]);
  assert.equal(r.isMarginalFirm, false);
  assert.equal(r.consecutiveSubOneYears, 1); // only the trailing 2026
});

test('detectMarginalFirm: a single sub-1.0 year is not 한계기업', () => {
  const r = detectMarginalFirm([
    { fiscalYear: 2026, operatingIncomeKrw: 50, interestExpenseKrw: 100 }
  ]);
  assert.equal(r.isMarginalFirm, false);
  assert.equal(r.consecutiveSubOneYears, 1);
});

test('detectMarginalFirm: null interest (no debt) breaks the run', () => {
  const r = detectMarginalFirm([
    { fiscalYear: 2024, operatingIncomeKrw: 80, interestExpenseKrw: 100 },
    { fiscalYear: 2025, operatingIncomeKrw: 80, interestExpenseKrw: 0 }, // null icr → breaks
    { fiscalYear: 2026, operatingIncomeKrw: 70, interestExpenseKrw: 100 }
  ]);
  assert.equal(r.consecutiveSubOneYears, 1);
  assert.equal(r.icrByYear[1].icr, null);
});

test('computeCreditTrend flags deterioration, improvement and band breaches', () => {
  const r = computeCreditTrend([
    { fiscalYear: 2025, debtToEquityPct: 150, interestCoverage: 4.0, revenueKrw: 1000 },
    { fiscalYear: 2026, debtToEquityPct: 260, interestCoverage: 2.0, revenueKrw: 900 }
  ]);
  assert.ok(r.deteriorating.some((s) => s.includes('부채비율 상승')));
  assert.ok(r.deteriorating.some((s) => s.includes('이자보상배율 급락')));
  assert.ok(r.deteriorating.some((s) => s.includes('매출 역성장')));
  assert.ok(r.flags.includes('부채비율 200% 돌파'));
});

test('computeCreditTrend: ICR crossing below 1.0 is a band breach; single period no-op', () => {
  const breach = computeCreditTrend([
    { fiscalYear: 2025, interestCoverage: 1.5 },
    { fiscalYear: 2026, interestCoverage: 0.8 }
  ]);
  assert.ok(breach.flags.includes('이자보상배율 1.0 미만 진입'));
  assert.deepEqual(computeCreditTrend([{ fiscalYear: 2026, interestCoverage: 0.8 }]), {
    deteriorating: [],
    improving: [],
    flags: []
  });
});

test('gradeToSpreadBps is monotonic by risk', () => {
  const grades = ['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'CCC'] as const;
  const spreads = grades.map((g) => gradeToSpreadBps(g).spreadBps);
  for (let i = 1; i < spreads.length; i += 1) assert.ok(spreads[i] > spreads[i - 1]);
  assert.ok(gradeToSpreadBps('AAA').rationale.includes('bps'));
});

test('assessFinancialFreshness bands by age (uses offsets from now)', () => {
  const monthsAgo = (m: number) => new Date(Date.now() - m * 30.4375 * 24 * 3600 * 1000);
  assert.equal(assessFinancialFreshness({ periodEndDate: monthsAgo(6) }).staleness, 'CURRENT');
  assert.equal(assessFinancialFreshness({ periodEndDate: monthsAgo(20) }).staleness, 'AGING');
  assert.equal(assessFinancialFreshness({ periodEndDate: monthsAgo(40) }).staleness, 'STALE');
  assert.equal(assessFinancialFreshness({}).staleness, 'UNKNOWN');
  // fiscalYear fallback ~ a few years back → STALE
  assert.equal(
    assessFinancialFreshness({ fiscalYear: new Date().getUTCFullYear() - 3 }).staleness,
    'STALE'
  );
});

test('summarizePeerPositioning names worst/top quartile ratios', () => {
  const r = summarizePeerPositioning([
    { ratioKey: 'debtToEquity', band: 'bottom' },
    { ratioKey: 'interestCoverage', band: 'bottom' },
    { ratioKey: 'ebitdaMargin', band: 'top' }
  ]);
  assert.deepEqual(r.worstQuartileRatios, ['부채비율', '이자보상배율']);
  assert.deepEqual(r.topQuartileRatios, ['EBITDA 마진']);
  assert.ok(r.headline?.includes('하위 25%'));
});
