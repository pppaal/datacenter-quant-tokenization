import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildStatementView,
  fromAssetStatements,
  type StatementPeriodInput
} from '@/lib/services/financials/statement-view';

const base = {
  revenue: 100,
  ebitda: 80,
  operatingIncome: 60,
  netIncome: 40,
  interestExpense: 10,
  cash: 30,
  totalDebt: 200,
  totalAssets: 500,
  totalEquity: 250,
  currentAssets: 90,
  currentLiabilities: 70,
  operatingCashFlow: 55,
  capex: 20
};

test('detail line items become a "상세 항목" section, unioned across periods', () => {
  const periods: StatementPeriodInput[] = [
    {
      ...base,
      label: '2026',
      lineItems: [
        { key: 'rent', label: '임대료수익', value: 70 },
        { key: 'parking', label: '주차수익', value: 5 }
      ]
    },
    {
      ...base,
      label: '2025',
      lineItems: [{ key: 'rent', label: '임대료수익', value: 66 }] // no parking this period
    }
  ];
  const view = buildStatementView(periods);
  const detail = view.sections.find((s) => s.title === '상세 항목');
  assert.ok(detail, 'detail section present');
  assert.deepEqual(
    detail!.rows.map((r) => r.label),
    ['임대료수익', '주차수익']
  );
  // rent across both periods; parking only 2026 (null for 2025).
  assert.deepEqual(detail!.rows[0].values, [70, 66]);
  assert.deepEqual(detail!.rows[1].values, [5, null]);
});

test('no "상세 항목" section when there are no line items', () => {
  const view = buildStatementView([{ ...base, label: '2026' }]);
  assert.equal(
    view.sections.find((s) => s.title === '상세 항목'),
    undefined
  );
});

test('fromAssetStatements coerces FinancialLineItem Decimal values', () => {
  const out = fromAssetStatements([
    {
      fiscalYear: 2026,
      fiscalPeriod: null,
      revenueKrw: 100,
      ebitdaKrw: 80,
      operatingIncomeKrw: 60,
      netIncomeKrw: 40,
      interestExpenseKrw: 10,
      cashKrw: 30,
      totalDebtKrw: 200,
      totalAssetsKrw: 500,
      totalEquityKrw: 250,
      currentAssetsKrw: 90,
      currentLiabilitiesKrw: 70,
      operatingCashFlowKrw: 55,
      capexKrw: 20,
      lineItems: [{ lineKey: 'rent', lineLabel: '임대료수익', valueKrw: { toString: () => '70' } }]
    }
  ]);
  assert.deepEqual(out[0].lineItems, [{ key: 'rent', label: '임대료수익', value: 70 }]);
});
