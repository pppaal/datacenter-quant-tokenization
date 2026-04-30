import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildQuarterlyNarrativeInputs,
  renderCapRateMatrixForPrompt,
  renderHouseViewBulletsForPrompt,
  renderTopTransactionsForPrompt
} from '@/lib/services/research/quarterly-narrative';
import type { CapRateBucket } from '@/lib/services/research/cap-rate-aggregator';

const baseBucket = (over: Partial<CapRateBucket>): CapRateBucket => ({
  market: 'KR',
  region: 'YEOUIDO',
  assetClass: 'OFFICE',
  assetTier: 'PRIME',
  count: 5,
  minPct: 4.4,
  medianPct: 4.6,
  maxPct: 4.8,
  latestObservedAt: new Date('2026-04-15'),
  ...over
});

test('renderCapRateMatrixForPrompt: empty input returns placeholder', () => {
  assert.equal(renderCapRateMatrixForPrompt([]), '(no rows)');
});

test('renderCapRateMatrixForPrompt: line shape includes class/tier and median range', () => {
  const out = renderCapRateMatrixForPrompt([baseBucket({})]);
  assert.match(out, /YEOUIDO/);
  assert.match(out, /OFFICE\/PRIME/);
  assert.match(out, /n=5/);
  assert.match(out, /4\.60%/);
  assert.match(out, /4\.40%–4\.80%/);
});

test('renderCapRateMatrixForPrompt: caps at 12 buckets sorted by count desc', () => {
  const buckets = Array.from({ length: 20 }, (_, i) =>
    baseBucket({ region: `submarket-${i}`, count: i + 1 })
  );
  const lines = renderCapRateMatrixForPrompt(buckets).split('\n');
  assert.equal(lines.length, 12);
  // Highest count (n=20) appears first.
  assert.match(lines[0]!, /n=20/);
});

test('renderCapRateMatrixForPrompt: untiered bucket renders as "Untiered"', () => {
  const out = renderCapRateMatrixForPrompt([baseBucket({ assetTier: null })]);
  assert.match(out, /OFFICE\/Untiered/);
});

test('renderTopTransactionsForPrompt: empty input returns placeholder', () => {
  assert.equal(renderTopTransactionsForPrompt([]), '(no transactions)');
});

test('renderTopTransactionsForPrompt: sorted by price desc, top 6', () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({
    transactionDate: new Date('2026-04-15'),
    market: 'KR',
    region: 'GANGNAM',
    assetClass: 'OFFICE',
    assetTier: 'PRIME',
    priceKrw: (10 - i) * 100_000_000_000,
    capRatePct: 4.5 + i * 0.1
  }));
  const lines = renderTopTransactionsForPrompt(rows).split('\n');
  assert.equal(lines.length, 6);
  // Largest deal (₩1,000,000,000,000 = 1조) first.
  assert.match(lines[0]!, /1,000억 KRW|1\.00조 KRW/);
});

test('renderHouseViewBulletsForPrompt: empty input returns placeholder', () => {
  assert.equal(
    renderHouseViewBulletsForPrompt([]),
    '(no approved house views this quarter)'
  );
});

test('renderHouseViewBulletsForPrompt: bullet format, top 8', () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({
    title: `House view ${i}`,
    summary: i % 2 === 0 ? `summary ${i}` : null
  }));
  const out = renderHouseViewBulletsForPrompt(rows);
  const lines = out.split('\n');
  assert.equal(lines.length, 8);
  assert.match(lines[0]!, /^- House view 0 — summary 0$/);
  assert.match(lines[1]!, /^- House view 1$/);
});

test('buildQuarterlyNarrativeInputs glues all three formatters', () => {
  const result = buildQuarterlyNarrativeInputs({
    buckets: [baseBucket({})],
    transactions: [
      {
        transactionDate: new Date('2026-04-10'),
        market: 'KR',
        region: 'YEOUIDO',
        assetClass: 'OFFICE',
        assetTier: 'PRIME',
        priceKrw: 500_000_000_000,
        capRatePct: 4.6
      }
    ],
    houseViews: [{ title: 'KR Office Q2', summary: 'cap rates compressing' }]
  });
  assert.match(result.capRateMatrix, /YEOUIDO/);
  assert.match(result.topTransactions, /YEOUIDO/);
  assert.match(result.houseViewBullets, /KR Office Q2/);
});
