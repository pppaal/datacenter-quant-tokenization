import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildPcapStatement,
  PCAP_TOTAL_ID,
  type PcapStatement
} from '@/lib/services/pcap-statement';
import { pcapStatementToXlsxSpec } from '@/lib/services/exports/pcap-statement-xlsx';
import type { LpStatement, PcapResult } from '@/lib/services/fund-nav';

function lp(
  partial: Pick<
    LpStatement,
    'investorId' | 'committedKrw' | 'calledKrw' | 'distributedKrw' | 'navShareKrw'
  > &
    Partial<LpStatement>
): LpStatement {
  return {
    investorCode: partial.investorId,
    investorName: partial.investorId,
    investorType: 'PROFESSIONAL',
    unfundedKrw: Math.max(partial.committedKrw - partial.calledKrw, 0),
    recallableKrw: 0,
    sharePct: 0,
    irrPct: null,
    tvpiMultiple: 0,
    dpiMultiple: 0,
    rvpiMultiple: 0,
    cashflowsAllocatedProRata: false,
    ...partial
  };
}

// LP A: committed 100, called 60, distributed 20, NAV share 50.
// LP B: committed 100, called 40, distributed 0,  NAV share 60.
const PCAP: PcapResult = {
  navKrw: 110,
  navUsedCostBasisFallback: false,
  navCostBasisFallbackAssets: [],
  totals: {
    committedKrw: 200,
    calledKrw: 100,
    distributedKrw: 20,
    unfundedKrw: 100,
    recallableKrw: 0,
    navShareKrw: 110,
    tvpiMultiple: 0,
    dpiMultiple: 0,
    rvpiMultiple: 0,
    irrPct: null
  },
  investors: [
    lp({ investorId: 'A', committedKrw: 100, calledKrw: 60, distributedKrw: 20, navShareKrw: 50 }),
    lp({ investorId: 'B', committedKrw: 100, calledKrw: 40, distributedKrw: 0, navShareKrw: 60 })
  ]
};

const lineOf = (s: PcapStatement, id: string) => s.lines.find((l) => l.investorId === id)!;

test('ITD roll-forward: beginning 0, contributions = called, distributions = distributed', () => {
  const s = buildPcapStatement({ pcap: PCAP });
  assert.equal(s.basis, 'INCEPTION_TO_DATE');
  assert.equal(s.periodLabel, null);
  assert.equal(s.cashflowsAllocatedProRata, false);

  const a = lineOf(s, 'A');
  assert.equal(a.beginningBalanceKrw, 0);
  assert.equal(a.contributionsKrw, 60);
  assert.equal(a.distributionsKrw, 20);
  assert.equal(a.endingBalanceKrw, 50);
  // ending − beginning − contributions + distributions = 50 − 0 − 60 + 20 = 10
  assert.equal(a.netOperatingResultKrw, 10);

  const b = lineOf(s, 'B');
  assert.equal(b.netOperatingResultKrw, 20); // 60 − 0 − 40 + 0
});

test('ITD totals close: the roll-forward identity holds on the fund total', () => {
  const s = buildPcapStatement({ pcap: PCAP });
  assert.equal(s.totals.investorId, PCAP_TOTAL_ID);
  assert.equal(s.totals.beginningBalanceKrw, 0);
  assert.equal(s.totals.contributionsKrw, 100);
  assert.equal(s.totals.distributionsKrw, 20);
  assert.equal(s.totals.endingBalanceKrw, 110);
  assert.equal(s.totals.netOperatingResultKrw, 30); // 10 + 20
  // identity
  const t = s.totals;
  assert.equal(
    t.endingBalanceKrw,
    t.beginningBalanceKrw + t.contributionsKrw - t.distributionsKrw + t.netOperatingResultKrw
  );
});

test('PERIOD with fund-level cashflows: prior NAV + pro-rata windowed flows', () => {
  const inWindow = new Date('2026-02-15');
  const outWindow = new Date('2026-05-15');
  const s = buildPcapStatement({
    pcap: PCAP,
    period: {
      label: 'Q1 2026',
      start: new Date('2026-01-01'),
      end: new Date('2026-03-31'),
      priorNavShareByInvestor: { A: 40, B: 45 },
      fundCapitalCalls: [
        { date: inWindow, amountKrw: 50 }, // pro-rata 25 / 25
        { date: outWindow, amountKrw: 999 } // ignored: outside window
      ],
      fundDistributions: [{ date: inWindow, amountKrw: 10 }] // pro-rata 5 / 5
    }
  });
  assert.equal(s.basis, 'PERIOD');
  assert.equal(s.periodLabel, 'Q1 2026');
  assert.equal(s.cashflowsAllocatedProRata, true);

  const a = lineOf(s, 'A');
  assert.equal(a.beginningBalanceKrw, 40);
  assert.equal(a.contributionsKrw, 25);
  assert.equal(a.distributionsKrw, 5);
  assert.equal(a.endingBalanceKrw, 50);
  assert.equal(a.netOperatingResultKrw, -10); // 50 − 40 − 25 + 5

  const b = lineOf(s, 'B');
  assert.equal(b.netOperatingResultKrw, -5); // 60 − 45 − 25 + 5

  assert.equal(s.totals.beginningBalanceKrw, 85);
  assert.equal(s.totals.contributionsKrw, 50);
  assert.equal(s.totals.netOperatingResultKrw, -15);
});

test('PERIOD with per-LP cashflows: no pro-rata allocation', () => {
  const d = new Date('2026-02-10');
  const s = buildPcapStatement({
    pcap: PCAP,
    period: {
      label: 'Q1 2026',
      start: new Date('2026-01-01'),
      end: new Date('2026-03-31'),
      priorNavShareByInvestor: { A: 0, B: 0 },
      fundCapitalCalls: [
        { date: d, amountKrw: 30, investorId: 'A' },
        { date: d, amountKrw: 10, investorId: 'B' }
      ]
    }
  });
  assert.equal(s.cashflowsAllocatedProRata, false);
  assert.equal(lineOf(s, 'A').contributionsKrw, 30);
  assert.equal(lineOf(s, 'B').contributionsKrw, 10);
});

test('xlsx spec mirrors the statement with a totals row', () => {
  const s = buildPcapStatement({ pcap: PCAP });
  const spec = pcapStatementToXlsxSpec(s, 'Fund I');
  assert.match(spec.title ?? '', /Fund I — LP 자본계정 변동표 \(PCAP\)/);
  assert.match(spec.title ?? '', /설립이래누계/);
  const sheet = spec.sheets[0]!;
  assert.equal(sheet.rows.length, 2);
  assert.equal(sheet.rows[0]!.ending, 50);
  assert.equal(sheet.rows[0]!.contributions, 60);
  assert.equal(sheet.totals!.ending, 110);
  assert.equal(sheet.totals!.nor, 30);
  assert.deepEqual(
    sheet.columns.map((c) => c.key),
    ['name', 'type', 'beginning', 'contributions', 'distributions', 'nor', 'ending']
  );
});
