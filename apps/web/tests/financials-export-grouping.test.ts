import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assetStatementsToWorkbookSpec } from '@/lib/services/financials/statement-view';
import { buildXlsx } from '@/lib/services/exports/xlsx';
import { parseWorkbook } from '@/lib/services/imports/xlsx';

/**
 * The financials Excel export must NOT blend multiple counterparties into one
 * comparative view (cross-entity YoY/CAGR + colliding period labels). It groups
 * by counterparty: one sheet-set per entity, sheet names prefixed to disambiguate.
 */

function stmt(counterpartyId: string, name: string, fiscalYear: number) {
  return {
    counterpartyId,
    counterparty: { name },
    fiscalYear,
    fiscalPeriod: 'FY',
    revenueKrw: 1000 + fiscalYear,
    ebitdaKrw: 500,
    operatingIncomeKrw: 400,
    netIncomeKrw: 200,
    interestExpenseKrw: 50,
    cashKrw: 300,
    totalDebtKrw: 2000,
    totalAssetsKrw: 5000,
    totalEquityKrw: 3000,
    currentAssetsKrw: 800,
    currentLiabilitiesKrw: 600,
    operatingCashFlowKrw: 350,
    capexKrw: 100
  };
}

test('single counterparty: sheet names are the raw section titles (unchanged)', () => {
  const single = assetStatementsToWorkbookSpec(
    [stmt('cp1', 'Tenant A', 2026), stmt('cp1', 'Tenant A', 2025)],
    'T'
  );
  // No counterparty prefix when only one entity is present.
  for (const sheet of single.sheets) {
    assert.equal(sheet.name.includes('·'), false, `unexpected prefix in "${sheet.name}"`);
  }
  assert.ok(single.sheets.length >= 1);
});

test('multiple counterparties: one prefixed sheet-set per entity, all names unique', async () => {
  const single = assetStatementsToWorkbookSpec([stmt('cp1', 'Tenant A', 2026)], 'T');
  const perEntity = single.sheets.length;

  const multi = assetStatementsToWorkbookSpec(
    [
      stmt('cp1', 'Tenant A', 2026),
      stmt('cp1', 'Tenant A', 2025),
      stmt('cp2', 'Tenant B', 2026),
      stmt('cp2', 'Tenant B', 2025)
    ],
    'T'
  );

  // Two entities → twice the sheets.
  assert.equal(multi.sheets.length, perEntity * 2);
  // Each entity contributes prefixed sheets.
  assert.ok(
    multi.sheets.some((s) => s.name.startsWith('Tenant A·')),
    'expected Tenant A sheets'
  );
  assert.ok(
    multi.sheets.some((s) => s.name.startsWith('Tenant B·')),
    'expected Tenant B sheets'
  );
  // Excel requires unique sheet names — the workbook must actually build + parse.
  const names = multi.sheets.map((s) => s.name);
  assert.equal(new Set(names).size, names.length, 'sheet names must be unique');
  for (const n of names) assert.ok(n.length <= 31, `sheet name too long: "${n}"`);

  const buffer = await buildXlsx(multi);
  const parsed = await parseWorkbook(buffer);
  // The workbook actually builds (Excel would reject duplicate/over-long names)
  // and round-trips every sheet.
  assert.equal(parsed.sheets.length, multi.sheets.length);
  assert.deepEqual(parsed.sheets.map((s) => s.name).sort(), names.slice().sort());
});
