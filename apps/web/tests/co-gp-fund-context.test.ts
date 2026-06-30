import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  capitalCallToNoticeInput,
  distributionToNoticeInput,
  buildLpQaInput,
  isoDate,
  type PcapLike
} from '@/lib/services/co-gp/fund-context';

const fund = { name: 'Fund I', vehicles: [{ name: 'SPV-1' }, { name: 'SPV-2' }] };

test('isoDate normalizes Date/string and yields empty on absent/invalid', () => {
  assert.equal(isoDate(new Date('2026-07-15T09:00:00Z')), '2026-07-15');
  assert.equal(isoDate('2026-07-15'), '2026-07-15');
  assert.equal(isoDate(null), '');
  assert.equal(isoDate('not-a-date'), '');
});

test('capital call maps to a CAPITAL_CALL notice; due date preferred over call date', () => {
  const n = capitalCallToNoticeInput(
    fund,
    {
      amountKrw: '10000000000',
      callDate: new Date('2026-07-01'),
      dueDate: new Date('2026-07-15'),
      purpose: '1차 캐피탈 콜'
    },
    '2026-06-30'
  );
  assert.equal(n.kind, 'CAPITAL_CALL');
  assert.equal(n.fundName, 'Fund I');
  assert.equal(n.vehicleName, 'SPV-1'); // first vehicle
  assert.equal(n.noticeDate, '2026-06-30');
  assert.equal(n.actionDate, '2026-07-15'); // due date wins
  assert.equal(n.totalAmountKrw, 10_000_000_000); // Decimal-string coerced
  assert.equal(n.reason, '1차 캐피탈 콜');
});

test('capital call without a due date falls back to the call date', () => {
  const n = capitalCallToNoticeInput(
    fund,
    { amountKrw: 5_000_000_000, callDate: new Date('2026-07-01'), dueDate: null },
    '2026-06-30'
  );
  assert.equal(n.actionDate, '2026-07-01');
});

test('distribution maps to a DISTRIBUTION notice', () => {
  const n = distributionToNoticeInput(
    { name: 'Fund I', vehicles: null },
    { amountKrw: 8_000_000_000, distributionDate: new Date('2026-08-01'), purpose: '분배 1회차' },
    '2026-06-30'
  );
  assert.equal(n.kind, 'DISTRIBUTION');
  assert.equal(n.vehicleName, null); // no vehicles
  assert.equal(n.actionDate, '2026-08-01');
  assert.equal(n.totalAmountKrw, 8_000_000_000);
});

test('buildLpQaInput grounds fund metrics from PCAP and caps deals at 8', () => {
  const pcap: PcapLike = {
    navKrw: 120_000_000_000,
    totals: { dpiMultiple: 0.4, tvpiMultiple: 1.3, irrPct: 12.4 }
  };
  const deals = Array.from({ length: 10 }, (_, i) => ({
    dealCode: `DC-${i}`,
    title: `Asset ${i}`,
    stage: 'SOURCED'
  }));
  const input = buildLpQaInput({
    question: 'NAV는?',
    asOf: '2026-06-30',
    fundName: 'Fund I',
    pcap,
    deals
  });
  assert.equal(input.fund?.name, 'Fund I');
  assert.equal(input.fund?.navKrw, 120_000_000_000);
  assert.equal(input.fund?.dpi, 0.4);
  assert.equal(input.fund?.irrPct, 12.4);
  assert.equal(input.deals?.length, 8); // capped
  assert.equal(input.deals?.[0]!.assetName, 'Asset 0');
});

test('buildLpQaInput omits fund context when fund/pcap absent', () => {
  const input = buildLpQaInput({ question: '?', asOf: '2026-06-30' });
  assert.equal(input.fund, null);
  assert.deepEqual(input.deals, []);
});
