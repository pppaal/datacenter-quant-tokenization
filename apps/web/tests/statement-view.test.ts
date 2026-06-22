import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildStatementView,
  fromAssetStatements,
  statementViewToXlsxSpec,
  type StatementPeriodInput
} from '@/lib/services/financials/statement-view';
import { buildXlsx } from '@/lib/services/exports/xlsx';
import { parseWorkbook } from '@/lib/services/imports/xlsx';

const periods: StatementPeriodInput[] = [
  {
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
  },
  {
    label: '2025',
    revenue: 39800,
    ebitda: 29900,
    operatingIncome: 18900,
    netIncome: 1130,
    interestExpense: 18200,
    cash: 15200,
    totalDebt: 380000,
    totalAssets: 715000,
    totalEquity: 280900,
    currentAssets: 19880,
    currentLiabilities: 16500,
    operatingCashFlow: 14700,
    capex: 3800
  }
];

test('buildStatementView builds 3 sections with aligned period columns', () => {
  const view = buildStatementView(periods);
  assert.deepEqual(view.periods, ['2026', '2025']);
  assert.deepEqual(
    view.sections.map((s) => s.title),
    ['손익계산서', '재무상태표', '현금흐름표']
  );
  for (const section of view.sections) {
    for (const r of section.rows) assert.equal(r.values.length, 2);
  }
});

test('derived rows: 부채총계 = 자산총계 − 자본총계, FCF = OCF − CAPEX, interest negated', () => {
  const view = buildStatementView(periods);
  const bs = view.sections.find((s) => s.title === '재무상태표')!;
  const debt = bs.rows.find((r) => r.label === '부채총계')!;
  assert.deepEqual(debt.values, [705350 - 275050, 715000 - 280900]); // [430300, 434100]

  const cf = view.sections.find((s) => s.title === '현금흐름표')!;
  const fcf = cf.rows.find((r) => r.label.startsWith('잉여현금흐름'))!;
  assert.deepEqual(fcf.values, [12100 - 4200, 14700 - 3800]); // [7900, 10900]

  const is = view.sections.find((s) => s.title === '손익계산서')!;
  const interest = is.rows.find((r) => r.label === '이자비용')!;
  assert.deepEqual(interest.values, [-18700, -18200]); // shown as outflow
});

test('null figures propagate as null (no coercion to 0)', () => {
  const view = buildStatementView([{ ...periods[0], netIncome: null, totalEquity: null }]);
  const is = view.sections[0];
  assert.equal(is.rows.find((r) => r.label === '당기순이익')!.values[0], null);
});

test('fromAssetStatements coerces Decimal-like values and labels periods', () => {
  const out = fromAssetStatements([
    {
      fiscalYear: 2026,
      fiscalPeriod: 'H1',
      revenueKrw: { toString: () => '41200' }, // Decimal-like
      ebitdaKrw: 30900,
      operatingIncomeKrw: '19800',
      netIncomeKrw: 1850,
      interestExpenseKrw: 18700,
      cashKrw: 9100,
      totalDebtKrw: 374000,
      totalAssetsKrw: 705350,
      totalEquityKrw: 275050,
      currentAssetsKrw: 14030,
      currentLiabilitiesKrw: 16900,
      operatingCashFlowKrw: 12100,
      capexKrw: 4200
    }
  ]);
  assert.equal(out[0].label, '2026 H1');
  assert.equal(out[0].revenue, 41200);
  assert.equal(out[0].operatingIncome, 19800);
});

test('statementViewToXlsxSpec → buildXlsx → round-trips period values', async () => {
  const view = buildStatementView(periods);
  const spec = statementViewToXlsxSpec(view, '재무제표 테스트');
  assert.equal(spec.sheets.length, 3);
  const buf = await buildXlsx(spec);
  const { sheets } = await parseWorkbook(buf);
  const is = sheets.find((s) => s.name === '손익계산서')!;
  // period value columns + analysis columns (2 periods → no CAGR).
  assert.deepEqual(is.headers, ['과목', '2026', '2025', '구성비(%)', 'YoY(%)']);
  // 매출액 row (indented) with both periods.
  const revenue = is.rows.find((r) => String(r[0]).includes('매출액'))!;
  assert.deepEqual([revenue[1], revenue[2]], [41200, 39800]);
});
