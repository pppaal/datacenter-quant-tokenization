import assert from 'node:assert/strict';
import test from 'node:test';
import {
  fundEquityRows,
  fundReportSummaryRows,
  fundReportToXlsxSpec,
  type FundReportSource
} from '@/lib/services/exports/fund-report-xlsx';
import { buildXlsx } from '@/lib/services/exports/xlsx';
import { parseWorkbook } from '@/lib/services/imports/xlsx';

const src: FundReportSource = {
  fundName: 'Fund I',
  commitmentKrw: 500_000_000_000,
  calledKrw: 300_000_000_000,
  distributedKrw: 120_000_000_000,
  unfundedKrw: 200_000_000_000,
  netInvestedKrw: 180_000_000_000,
  navKrw: 300_000_000_000,
  dryPowderKrw: 200_000_000_000,
  targetSizeKrw: 600_000_000_000,
  pendingCallsKrw: 10_000_000_000,
  pendingDistributionsKrw: 5_000_000_000,
  calls: [
    {
      date: '2026-03-01',
      dueDate: '2026-03-15',
      amountKrw: 100_000_000_000,
      purpose: '취득',
      status: 'FUNDED'
    },
    {
      date: '2026-06-01',
      dueDate: '2026-06-15',
      amountKrw: 50_000_000_000,
      purpose: 'CAPEX',
      status: 'PLANNED'
    }
  ],
  distributions: [
    { date: '2026-04-30', amountKrw: 120_000_000_000, purpose: '임대수익 분배', status: 'PAID' }
  ]
};

test('fundReportSummaryRows derives DPI / TVPI / 납입률', () => {
  const rows = fundReportSummaryRows(src);
  const by = (item: string) => rows.find((r) => r.item === item)!;
  assert.equal(by('약정총액').value, 500_000_000_000);
  // DPI = 120/300 = 0.4; TVPI = (300+120)/300 = 1.4; 납입률 = 300/500 = 60%.
  assert.equal(by('DPI').value, 0.4);
  assert.equal(by('TVPI').value, 1.4);
  assert.equal(by('납입률').value, 60);
});

test('null targetSize / zero called are handled', () => {
  const rows = fundReportSummaryRows({ ...src, targetSizeKrw: null, calledKrw: 0 });
  assert.equal(rows.find((r) => r.item === '목표 규모')!.value, null);
  assert.equal(rows.find((r) => r.item === 'DPI')!.value, null); // /0 guard
});

test('fundEquityRows derives the contribution-basis equity roll (sums to NAV)', () => {
  const rows = fundEquityRows(src);
  // 기초 0 + 출자(called) − 분배(distributed) + 누적손익(nav − netInvested) = NAV.
  const sum = rows.reduce((s, r) => s + r.amountKrw, 0);
  assert.equal(sum, src.navKrw);
  assert.equal(rows.find((r) => r.item.startsWith('출자'))!.amountKrw, src.calledKrw);
  assert.equal(rows.find((r) => r.item.startsWith('분배'))!.amountKrw, -src.distributedKrw);
});

test('fundReportToXlsxSpec → buildXlsx → re-parse, 4 sheets + call total', async () => {
  const spec = fundReportToXlsxSpec(src);
  assert.deepEqual(
    spec.sheets.map((s) => s.name),
    ['요약', '캐피탈콜', '분배', '자본변동표']
  );
  const buf = await buildXlsx(spec);
  const { sheets } = await parseWorkbook(buf);
  const calls = sheets.find((s) => s.name === '캐피탈콜')!;
  // 2 call rows + a totals row.
  assert.equal(calls.rows.length, 3);
  const totalRow = calls.rows[calls.rows.length - 1];
  assert.equal(totalRow[0], '합계');
  assert.equal(totalRow[2], 150_000_000_000); // 100bn + 50bn
});
