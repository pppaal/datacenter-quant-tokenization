import assert from 'node:assert/strict';
import test from 'node:test';
import { LiveReoneRentComps, resolveReoneRegion } from '@/lib/services/public-data/live/rone-rent';
import type { fetchWithTimeout } from '@/lib/services/public-data/fetch-with-timeout';

/**
 * Pins the R-ONE 상업용부동산 임대동향 adapter against the real API response shape
 * (confirmed live): rows under SttsApiTblData[1].row[], rent in 천원/㎡ (×1000 →
 * 원/㎡), region in CLS_NM, latest quarter by WRTTIME_IDTFR_ID, vacancy →
 * occupancy, 소득수익률 → cap rate. Office and retail (중대형상가) each have their
 * own STATBL_ID set.
 */

const GANGNAM = { latitude: 37.5, longitude: 127.04 };

// Default STATBL_IDs the connector queries (kept in sync with rone-rent.ts).
const OFFICE_RENT = 'TT249843134237374';
const OFFICE_VACANCY = 'TT244763134428698';
const OFFICE_YIELD = 'T245883135037859';
const RETAIL_RENT = 'T244363134858603';
const RETAIL_VACANCY = 'T249633134845544';
const RETAIL_YIELD = 'T242083134887473';

function table(rows: Array<Record<string, unknown>>) {
  return { SttsApiTblData: [{ head: [{ list_total_count: rows.length }] }, { row: rows }] };
}
function rentBody(rows: Array<[string, number, string]>) {
  return table(
    rows.map(([CLS_NM, DTA_VAL, WRTTIME_IDTFR_ID]) => ({
      CLS_NM,
      DTA_VAL,
      UI_NM: '천원/㎡',
      ITM_NM: '임대료',
      WRTTIME_IDTFR_ID,
      WRTTIME_DESC: '2024년 3분기'
    }))
  );
}
function vacancyBody(rows: Array<[string, number, string]>) {
  return table(
    rows.map(([CLS_NM, DTA_VAL, WRTTIME_IDTFR_ID]) => ({
      CLS_NM,
      DTA_VAL,
      UI_NM: '%',
      ITM_NM: '공실률',
      WRTTIME_IDTFR_ID,
      WRTTIME_DESC: '2024년 3분기'
    }))
  );
}
/** Yield table carries multiple items per region; the adapter must pick 소득수익률. */
function yieldBody(rows: Array<[string, string, number, string]>) {
  return table(
    rows.map(([CLS_NM, ITM_NM, DTA_VAL, WRTTIME_IDTFR_ID]) => ({
      CLS_NM,
      ITM_NM,
      DTA_VAL,
      UI_NM: '%',
      WRTTIME_IDTFR_ID,
      WRTTIME_DESC: '2024년 3분기'
    }))
  );
}

/** Routes each STATBL_ID in the request URL to the matching canned body. */
function fetcherFor(bodies: Record<string, unknown>) {
  const calls: string[] = [];
  const fetcher = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const id = Object.keys(bodies).find((statblId) => url.includes(statblId));
    return { ok: true, json: async () => (id ? bodies[id] : table([])) } as Response;
  }) as typeof fetchWithTimeout;
  return { calls, fetcher };
}

test('resolveReoneRegion maps Gangnam coords to the 강남 권역', () => {
  assert.equal(resolveReoneRegion(GANGNAM).clsNm, '강남');
  assert.equal(resolveReoneRegion({ latitude: 37.57, longitude: 126.98 }).clsNm, '도심');
});

test('R-ONE OFFICE: 천원→원 rent, vacancy→occupancy, 소득수익률→cap rate', async () => {
  const { fetcher } = fetcherFor({
    [OFFICE_RENT]: rentBody([
      ['강남', 24.0, '202402'], // older quarter — must be ignored
      ['강남', 25.3742867548887, '202403'],
      ['도심', 29.67, '202403']
    ]),
    [OFFICE_VACANCY]: vacancyBody([['강남', 5.5, '202403']]),
    [OFFICE_YIELD]: yieldBody([
      ['강남', '자본수익률', 0.9, '202403'],
      ['강남', '소득수익률', 1.12, '202403'], // ← cap rate (preferred ITM)
      ['강남', '투자수익률', 2.02, '202403']
    ])
  });
  const adapter = new LiveReoneRentComps('test-key', undefined, 8000, fetcher);

  const c = (await adapter.fetch(GANGNAM, 'OFFICE', 3))[0]!;
  assert.equal(c.monthlyRentKrwPerSqm, 25374); // 25.3742… 천원/㎡ ×1000
  assert.equal(c.occupancyPct, 94.5); // 100 − 5.5
  assert.equal(c.capRatePct, 1.12); // 소득수익률, not 투자/자본
  assert.ok(c.note?.includes('오피스'));
  assert.ok(c.note?.includes('강남'));
});

test('R-ONE RETAIL uses the 중대형상가 tables', async () => {
  const { fetcher, calls } = fetcherFor({
    [RETAIL_RENT]: rentBody([['강남', 30.0, '202403']]),
    [RETAIL_VACANCY]: vacancyBody([['강남', 8.0, '202403']]),
    [RETAIL_YIELD]: yieldBody([['강남', '소득수익률', 1.4, '202403']])
  });
  const adapter = new LiveReoneRentComps('test-key', undefined, 8000, fetcher);

  const c = (await adapter.fetch(GANGNAM, 'RETAIL', 3))[0]!;
  assert.equal(c.monthlyRentKrwPerSqm, 30000); // 30 천원/㎡ ×1000
  assert.equal(c.occupancyPct, 92); // 100 − 8
  assert.equal(c.capRatePct, 1.4);
  assert.ok(c.note?.includes('중대형상가'));
  // It must hit the retail tables, never the office ones.
  assert.ok(calls.some((u) => u.includes(RETAIL_RENT)));
  assert.ok(!calls.some((u) => u.includes(OFFICE_RENT)));
});

test('R-ONE adapter returns [] for unsupported classes and when no key is set', async () => {
  const { fetcher } = fetcherFor({});
  const adapter = new LiveReoneRentComps('k', undefined, 8000, fetcher);
  assert.deepEqual(await adapter.fetch(GANGNAM, 'LOGISTICS', 3), []);
  assert.deepEqual(await adapter.fetch(GANGNAM, 'DATA_CENTER', 3), []);

  const noKey = new LiveReoneRentComps(undefined);
  assert.deepEqual(await noKey.fetch(GANGNAM, 'OFFICE', 3), []);
});
