import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildStatementView,
  type StatementPeriodInput
} from '@/lib/services/financials/statement-view';

// Newest-first, two periods.
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

function findRow(view: ReturnType<typeof buildStatementView>, section: string, label: string) {
  return view.sections.find((s) => s.title === section)!.rows.find((r) => r.label === label)!;
}

test('YoY: newest column vs next-older, oldest column null', () => {
  const view = buildStatementView(periods);
  const revenue = findRow(view, '손익계산서', '매출액');
  // (41200-39800)/39800*100 = 3.5
  assert.equal(revenue.yoy?.[0], 3.5);
  assert.equal(revenue.yoy?.[1], null); // oldest has no prior
});

test('common-size: IS rows as % of revenue (base row = 100%)', () => {
  const view = buildStatementView(periods);
  const revenue = findRow(view, '손익계산서', '매출액');
  assert.equal(revenue.commonSize?.[0], 100);
  const ebitda = findRow(view, '손익계산서', 'EBITDA');
  // 30900/41200*100 = 75.0
  assert.equal(ebitda.commonSize?.[0], 75);
});

test('common-size: BS base is 자산총계, CF base is 영업활동현금흐름', () => {
  const view = buildStatementView(periods);
  assert.equal(findRow(view, '재무상태표', '자산총계').commonSize?.[0], 100);
  assert.equal(findRow(view, '현금흐름표', '영업활동현금흐름').commonSize?.[0], 100);
});

test('detail-line section has no common-size; single period has null YoY', () => {
  const withLines = buildStatementView([
    { ...periods[0], lineItems: [{ key: 'rent', label: '임대료', value: 100 }] }
  ]);
  const detail = withLines.sections.find((s) => s.title === '상세 항목')!;
  assert.equal(detail.rows[0].commonSize, undefined);
  assert.equal(detail.rows[0].yoy?.[0], null); // only one period
});

test('common-size: null (not sign-flipped) when the CF base is negative', () => {
  // A cash-burn period: operating cash flow is negative, so the CF section base
  // is non-positive. Common-size % off a negative base would flip every sign and
  // mislead — it must collapse to null instead.
  const view = buildStatementView([
    { ...periods[0], operatingCashFlow: -5000, capex: 1000 },
    { ...periods[1], operatingCashFlow: 8000 }
  ]);
  const cf = view.sections.find((s) => s.title === '현금흐름표')!;
  const capexRow = cf.rows.find((r) => r.label.startsWith('자본적지출'))!;
  // Period 0 base is negative → null; period 1 base is positive → a real %.
  assert.equal(capexRow.commonSize?.[0], null);
  assert.equal(typeof capexRow.commonSize?.[1], 'number');
});

test('YoY null-safe when a period value is null', () => {
  const view = buildStatementView([
    { ...periods[0], netIncome: 1850 },
    { ...periods[1], netIncome: null }
  ]);
  const ni = findRow(view, '손익계산서', '당기순이익');
  assert.equal(ni.yoy?.[0], null); // prior is null
});
