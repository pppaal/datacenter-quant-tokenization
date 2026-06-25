import assert from 'node:assert/strict';
import test from 'node:test';
import { imDeckFromReport, krwCompact } from '@/lib/services/exports/im-deck-from-report';

const base = {
  assetName: '여의도 프라임',
  assetType: 'OFFICE',
  market: 'KR',
  recommendation: 'Proceed To Committee',
  confidenceScore: 7.8,
  baseValueKrw: 682_000_000_000,
  goingInYieldPct: 4.8,
  exitCapPct: 5.1,
  minDscr: 1.28,
  upsideToBullPct: 12.4,
  downsideToBearPct: -8.1
};

test('krwCompact renders 억/조', () => {
  assert.equal(krwCompact(682_000_000_000), '₩6,820억');
  assert.equal(krwCompact(12_300_000_000_000), '₩12.3조');
});

test('krwCompact preserves sub-억 precision instead of rounding away', () => {
  // 1.5억 must not round to ₩2억 (the old Math.round(eok) behavior).
  assert.equal(krwCompact(150_000_000), '₩1.5억');
  // A 5천만 figure used to collapse to "₩1억" (round up) or "₩0억"; now it shows 만.
  assert.equal(krwCompact(50_000_000), '₩5,000만');
  // A 4천9백만 figure used to round to "₩0억"; now it shows 만.
  assert.equal(krwCompact(49_000_000), '₩4,900만');
  // Sub-만 figures fall through to whole 원.
  assert.equal(krwCompact(7_500), '₩7,500');
});

test('imDeckFromReport builds a titled deck with metric + thesis sections', () => {
  const deck = imDeckFromReport(base);
  assert.match(deck.title, /여의도 프라임 — 투자심의 메모/);
  assert.equal(deck.subtitle, 'OFFICE · KR');
  assert.equal(deck.sections.length, 2);
  const metrics = deck.sections[0].metrics!;
  assert.equal(metrics.find((m) => m.label === '기준 가치')!.value, '₩6,820억');
  assert.equal(metrics.find((m) => m.label === 'Going-in 수익률')!.value, '4.8%');
  // recommendation localized + tone good for "Proceed To Committee".
  const reco = metrics.find((m) => m.label === '권고')!;
  assert.equal(reco.value, '심의 상정');
  assert.equal(reco.tone, 'good');
});

test('recommendation tone degrades and localizes', () => {
  assert.equal(
    imDeckFromReport({
      ...base,
      recommendation: 'Further Diligence Required'
    }).sections[0].metrics!.find((m) => m.label === '권고')!.tone,
    'bad'
  );
  assert.equal(
    imDeckFromReport({
      ...base,
      recommendation: 'Proceed With Conditions'
    }).sections[0].metrics!.find((m) => m.label === '권고')!.value,
    '조건부 상정'
  );
});

test('null metrics render as — without throwing', () => {
  const deck = imDeckFromReport({
    ...base,
    goingInYieldPct: null,
    exitCapPct: null,
    minDscr: null,
    confidenceScore: null,
    upsideToBullPct: null,
    downsideToBearPct: null
  });
  const metrics = deck.sections[0].metrics!;
  assert.equal(metrics.find((m) => m.label === 'Going-in 수익률')!.value, '—');
  assert.equal(metrics.find((m) => m.label === '최저 DSCR')!.value, '—');
});
