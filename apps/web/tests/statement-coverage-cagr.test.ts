import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildStatementView,
  statementCoverage,
  type StatementPeriodInput
} from '@/lib/services/financials/statement-view';

const full: StatementPeriodInput = {
  label: '2026',
  revenue: 41200,
  ebitda: 30900,
  operatingIncome: 19800,
  netIncome: 1850,
  interestExpense: 18700,
  cash: 9100,
  totalDebt: 374000,
  totalAssets: 705350,
  totalEquity: 275050,
  currentAssets: 14030,
  currentLiabilities: 16900,
  operatingCashFlow: 12100,
  capex: 4200
};

test('statementCoverage: full filing = 13/13 (100%)', () => {
  const [c] = statementCoverage([full]);
  assert.equal(c.present, 13);
  assert.equal(c.total, 13);
  assert.equal(c.coveragePct, 100);
});

test('statementCoverage: sparse filing reports the gap', () => {
  const sparse: StatementPeriodInput = {
    ...full,
    ebitda: null,
    operatingIncome: null,
    netIncome: null,
    interestExpense: null,
    totalDebt: null,
    currentAssets: null,
    currentLiabilities: null,
    operatingCashFlow: null,
    capex: null
  };
  const [c] = statementCoverage([sparse]);
  assert.equal(c.present, 4); // revenue, cash, totalAssets, totalEquity
  assert.equal(c.coveragePct, Math.round((4 / 13) * 100));
});

test('buildStatementView exposes coverage aligned with periods', () => {
  const view = buildStatementView([full, { ...full, label: '2025' }]);
  assert.equal(view.coverage.length, 2);
  assert.equal(view.coverage[0].coveragePct, 100);
});

test('CAGR: computed over ≥3 periods (newest-first), null for <3', () => {
  // revenue 121 (2026) / 110 (2025) / 100 (2024) → CAGR over 2 intervals = 10%.
  const view3 = buildStatementView([
    { ...full, label: '2026', revenue: 121 },
    { ...full, label: '2025', revenue: 110 },
    { ...full, label: '2024', revenue: 100 }
  ]);
  const rev3 = view3.sections[0].rows.find((r) => r.label === '매출액')!;
  assert.equal(rev3.cagrPct, 10);

  const view2 = buildStatementView([full, { ...full, label: '2025' }]);
  assert.equal(view2.sections[0].rows[0].cagrPct, null); // <3 periods
});

test('CAGR null-safe on non-positive / missing endpoints', () => {
  const view = buildStatementView([
    { ...full, label: '2026', revenue: 120 },
    { ...full, label: '2025', revenue: 110 },
    { ...full, label: '2024', revenue: 0 } // earliest non-positive
  ]);
  assert.equal(view.sections[0].rows.find((r) => r.label === '매출액')!.cagrPct, null);
});
