import assert from 'node:assert/strict';
import test from 'node:test';
import {
  aggregateCommercialRows,
  fetchMolitCommercialMonth
} from '@/lib/services/quarterly-report/connectors/molit-transactions';
import { __resetEnvCache } from '@/lib/env';

/**
 * aggregateCommercialRows is the pure row-level math behind the MOLIT 실거래가
 * monthly aggregate. These tests pin two correctness rules that the previous
 * inline version got wrong.
 */

test('transactionCount counts only rows with a valid deal amount', () => {
  const rows = [
    { 거래금액: '500,000', 건물면적: '100' }, // valid → 5,000,000,000 KRW
    { 거래금액: '', 건물면적: '50' }, // blank amount → dropped
    { 거래금액: '0', 건물면적: '80' }, // zero amount → dropped
    { 거래금액: 'N/A', 건물면적: '40' }, // non-numeric → dropped
    { 거래금액: '300,000', 건물면적: '60' } // valid → 3,000,000,000 KRW
  ];

  const result = aggregateCommercialRows(rows);

  // Only the two real transactions count — NOT all five parsed rows.
  assert.equal(result.transactionCount, 2);
  // Volume reflects exactly the rows counted: 5e9 + 3e9.
  assert.equal(result.volumeKrw, 8_000_000_000);
  // The count never exceeds the rows that contributed to the volume.
  assert.equal(result.pricesPerSqm.length, 2);
});

test('rows with a valid amount but no usable area count, yet carry no per-sqm price', () => {
  const rows = [
    { 거래금액: '200,000', 건물면적: '' }, // valid amount, no area
    { 거래금액: '200,000', 건물면적: '0' }, // valid amount, zero area
    { 거래금액: '100,000', 건물면적: '25' } // valid both
  ];

  const result = aggregateCommercialRows(rows);

  // All three are real transactions.
  assert.equal(result.transactionCount, 3);
  assert.equal(result.volumeKrw, 5_000_000_000);
  // Only the one row with usable area yields a per-sqm price.
  assert.equal(result.pricesPerSqm.length, 1);
  // 1,000,000,000 KRW / 25 sqm = 40,000,000 KRW/sqm.
  assert.equal(result.pricesPerSqm[0], 40_000_000);
});

test('pricesPerSqm is returned raw so a quarter can pool before medianing', () => {
  // Month A: many cheap transactions; Month B: one expensive one. A pooled
  // median weights by transaction COUNT — a median-of-medians would not.
  const monthA = aggregateCommercialRows([
    { 거래금액: '100,000', 건물면적: '100' }, // 10,000,000 /sqm
    { 거래금액: '110,000', 건물면적: '100' }, // 11,000,000 /sqm
    { 거래금액: '120,000', 건물면적: '100' } // 12,000,000 /sqm
  ]);
  const monthB = aggregateCommercialRows([
    { 거래금액: '900,000', 건물면적: '100' } // 90,000,000 /sqm
  ]);

  const pooled = [...monthA.pricesPerSqm, ...monthB.pricesPerSqm].sort((a, b) => a - b);
  // pooled = [10M, 11M, 12M, 90M] → true median = (11M + 12M) / 2 = 11.5M.
  const mid = Math.floor(pooled.length / 2);
  const pooledMedian = (pooled[mid - 1]! + pooled[mid]!) / 2;
  assert.equal(pooledMedian, 11_500_000);

  // A naive median-of-medians (monthA median 11M, monthB median 90M) would be
  // (11M + 90M) / 2 = 50.5M — wildly off. Confirm the pooled answer differs.
  assert.notEqual(pooledMedian, 50_500_000);
});

test('empty input yields zero count and no prices', () => {
  const result = aggregateCommercialRows([]);
  assert.equal(result.transactionCount, 0);
  assert.equal(result.volumeKrw, 0);
  assert.deepEqual(result.pricesPerSqm, []);
});

test('fetchMolitCommercialMonth paginates past the first page (no silent truncation)', async () => {
  // A month with 1,500 deals must be fetched across two pages (numOfRows=1000),
  // not truncated at page 1. Drive the loop off the upstream totalCount.
  const TOTAL = 1500;
  const PAGE_SIZE = 1000;
  const itemXml = '<item><거래금액>500,000</거래금액><건물면적>100</건물면적></item>';
  const pageUrls: string[] = [];

  const originalFetch = globalThis.fetch;
  process.env.MOLIT_API_KEY = 'test-molit-key';
  __resetEnvCache();
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    pageUrls.push(url);
    const pageNo = Number(new URL(url).searchParams.get('pageNo'));
    const rows = pageNo === 1 ? PAGE_SIZE : TOTAL - PAGE_SIZE; // 1000 then 500
    const body = `<response><header><resultCode>000</resultCode></header><body><totalCount>${TOTAL}</totalCount><items>${itemXml.repeat(rows)}</items></body></response>`;
    return new Response(body, { status: 200 });
  }) as typeof fetch;

  try {
    const result = await fetchMolitCommercialMonth('강남구', '202601');
    assert.ok(result, 'expected an aggregate');
    // All 1,500 rows aggregated (each row has a valid 거래금액), proving both
    // pages were fetched and merged.
    assert.equal(result!.transactionCount, TOTAL);
    assert.equal(pageUrls.length, 2, 'expected exactly two page fetches');
    assert.equal(Number(new URL(pageUrls[1]!).searchParams.get('pageNo')), 2);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.MOLIT_API_KEY;
    __resetEnvCache();
  }
});
