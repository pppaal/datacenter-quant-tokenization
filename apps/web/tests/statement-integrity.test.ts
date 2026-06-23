import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildStatementView,
  checkStatementIntegrity,
  type StatementPeriodInput
} from '@/lib/services/financials/statement-view';

const clean: StatementPeriodInput = {
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

test('clean statement produces no integrity flags', () => {
  const [r] = checkStatementIntegrity([clean]);
  assert.deepEqual(r.flags, []);
});

test('negative equity → 자본잠식', () => {
  const [r] = checkStatementIntegrity([{ ...clean, totalEquity: -5000 }]);
  assert.ok(r.flags.some((f) => f.includes('자본잠식')));
});

test('equity > assets and op > EBITDA flagged', () => {
  const [r] = checkStatementIntegrity([
    { ...clean, totalEquity: 800000, operatingIncome: 31000 } // equity>assets; op>ebitda(30900)
  ]);
  assert.ok(r.flags.some((f) => f.includes('자본 > 자산')));
  assert.ok(r.flags.some((f) => f.includes('영업이익 > EBITDA')));
});

test('current assets exceeding total assets flagged; missing data never flags', () => {
  const [bad] = checkStatementIntegrity([{ ...clean, currentAssets: 800000 }]);
  assert.ok(bad.flags.some((f) => f.includes('유동자산 > 자산총계')));
  const [sparse] = checkStatementIntegrity([
    { ...clean, totalEquity: null, totalAssets: null, ebitda: null }
  ]);
  assert.deepEqual(sparse.flags, []);
});

test('current liabilities exceeding total assets flagged (parse/scale error)', () => {
  const [r] = checkStatementIntegrity([{ ...clean, currentLiabilities: 800000 }]);
  assert.ok(r.flags.some((f) => f.includes('유동부채 > 자산총계')));
  // and still clean when within bounds
  const [ok] = checkStatementIntegrity([clean]);
  assert.ok(!ok.flags.some((f) => f.includes('유동부채 > 자산총계')));
});

test('negative revenue flagged as a mis-parsed sign', () => {
  const [r] = checkStatementIntegrity([{ ...clean, revenue: -100 }]);
  assert.ok(r.flags.some((f) => f.includes('매출액 음수')));
  // missing revenue never flags
  const [sparse] = checkStatementIntegrity([{ ...clean, revenue: null }]);
  assert.ok(!sparse.flags.some((f) => f.includes('매출액 음수')));
});

test('buildStatementView surfaces integrity aligned with periods', () => {
  const view = buildStatementView([clean, { ...clean, label: '2025', totalEquity: -1 }]);
  assert.equal(view.integrity.length, 2);
  assert.deepEqual(view.integrity[0].flags, []);
  assert.ok(view.integrity[1].flags.some((f) => f.includes('자본잠식')));
});
