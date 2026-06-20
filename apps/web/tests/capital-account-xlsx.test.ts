import assert from 'node:assert/strict';
import test from 'node:test';
import { pcapToXlsxSpec } from '@/lib/services/exports/capital-account-xlsx';
import { buildXlsx } from '@/lib/services/exports/xlsx';
import { parseWorkbook } from '@/lib/services/imports/xlsx';
import type { PcapResult } from '@/lib/services/fund-nav';

const pcap: PcapResult = {
  navKrw: 300_000_000_000,
  navUsedCostBasisFallback: false,
  navCostBasisFallbackAssets: [],
  totals: {
    committedKrw: 500_000_000_000,
    calledKrw: 300_000_000_000,
    distributedKrw: 120_000_000_000,
    unfundedKrw: 200_000_000_000,
    recallableKrw: 0,
    navShareKrw: 300_000_000_000,
    tvpiMultiple: 1.4,
    dpiMultiple: 0.4,
    rvpiMultiple: 1.0,
    irrPct: 12.4
  },
  investors: [
    {
      investorId: 'i1',
      investorCode: 'NPS',
      investorName: '국민연금공단',
      investorType: 'PENSION',
      committedKrw: 200_000_000_000,
      calledKrw: 120_000_000_000,
      distributedKrw: 48_000_000_000,
      unfundedKrw: 80_000_000_000,
      recallableKrw: 0,
      navShareKrw: 120_000_000_000,
      sharePct: 40,
      irrPct: 12.4,
      tvpiMultiple: 1.4,
      dpiMultiple: 0.4,
      rvpiMultiple: 1.0,
      cashflowsAllocatedProRata: false
    }
  ]
};

test('pcapToXlsxSpec maps investors + totals, percent figures scaled to fractions', () => {
  const spec = pcapToXlsxSpec(pcap, 'Fund I');
  assert.match(spec.title ?? '', /Fund I — LP 자본계정/);
  const sheet = spec.sheets[0];
  assert.equal(sheet.rows.length, 1);
  assert.equal(sheet.rows[0].name, '국민연금공단');
  assert.equal(sheet.rows[0].committed, 200_000_000_000);
  // sharePct 40 → 0.40 (Excel percent format), irrPct 12.4 → 0.124.
  assert.equal(sheet.rows[0].share, 0.4);
  assert.equal(sheet.rows[0].irr, 0.124);
  assert.equal(sheet.totals!.name, '합계');
  assert.equal(sheet.totals!.committed, 500_000_000_000);
});

test('pcapToXlsxSpec → buildXlsx → re-parse round-trips', async () => {
  const buf = await buildXlsx(pcapToXlsxSpec(pcap, 'Fund I'));
  const { sheets } = await parseWorkbook(buf);
  const s = sheets.find((x) => x.name === 'LP 자본계정')!;
  assert.deepEqual(s.headers.slice(0, 3), ['투자자', '유형', '약정액(KRW)']);
  const npsRow = s.rows.find((r) => String(r[0]).includes('국민연금'))!;
  assert.equal(npsRow[2], 200_000_000_000); // committed
});

test('null IRR maps to null (not 0)', () => {
  const spec = pcapToXlsxSpec(
    { ...pcap, investors: [{ ...pcap.investors[0], irrPct: null }] },
    'Fund I'
  );
  assert.equal(spec.sheets[0].rows[0].irr, null);
});
