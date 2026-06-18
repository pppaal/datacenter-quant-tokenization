import assert from 'node:assert/strict';
import test from 'node:test';
import { LiveReoneRentComps, resolveReoneRegion } from '@/lib/services/public-data/live/rone-rent';
import type { fetchWithTimeout } from '@/lib/services/public-data/fetch-with-timeout';

/**
 * Pins the R-ONE 상업용부동산 임대동향(오피스) adapter against the real API
 * response shape (confirmed live): rows under SttsApiTblData[1].row[], rent in
 * 천원/㎡ (must ×1000 → 원/㎡), region in CLS_NM, latest quarter by
 * WRTTIME_IDTFR_ID, vacancy → occupancy, and 소득수익률 → cap rate from the
 * separate 수익률 table (which carries multiple ITMs).
 */

const GANGNAM = { latitude: 37.5, longitude: 127.04 };

// Default STATBL_IDs the connector queries (kept in sync with rone-rent.ts).
const RENT_ID = 'TT249843134237374';
const VACANCY_ID = 'TT244763134428698';
// (yield table TT… is the else branch in fetcherFor below)

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

function fetcherFor(rent: unknown, vacancy: unknown, yld: unknown) {
  const calls: string[] = [];
  const fetcher = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const body = url.includes(RENT_ID) ? rent : url.includes(VACANCY_ID) ? vacancy : yld;
    return { ok: true, json: async () => body } as Response;
  }) as typeof fetchWithTimeout;
  return { calls, fetcher };
}

test('resolveReoneRegion maps Gangnam coords to the 강남 권역', () => {
  assert.equal(resolveReoneRegion(GANGNAM).clsNm, '강남');
  assert.equal(resolveReoneRegion({ latitude: 37.57, longitude: 126.98 }).clsNm, '도심');
});

test('R-ONE office adapter: 천원→원 rent, vacancy→occupancy, 소득수익률→cap rate', async () => {
  // Two quarters present; the adapter must pick the latest (202403 > 202402).
  const { fetcher } = fetcherFor(
    rentBody([
      ['강남', 24.0, '202402'],
      ['강남', 25.3742867548887, '202403'],
      ['도심', 29.67, '202403']
    ]),
    vacancyBody([['강남', 5.5, '202403']]),
    yieldBody([
      ['강남', '자본수익률', 0.9, '202403'],
      ['강남', '소득수익률', 1.12, '202403'], // ← cap rate (preferred ITM)
      ['강남', '투자수익률', 2.02, '202403']
    ])
  );
  const adapter = new LiveReoneRentComps(
    'test-key',
    undefined,
    8000,
    undefined,
    undefined,
    undefined,
    fetcher
  );

  const comps = await adapter.fetch(GANGNAM, 'OFFICE', 3);
  assert.equal(comps.length, 1);
  const c = comps[0]!;
  assert.equal(c.monthlyRentKrwPerSqm, 25374); // 25.3742… 천원/㎡ ×1000
  assert.equal(c.occupancyPct, 94.5); // 100 − 5.5
  assert.equal(c.capRatePct, 1.12); // 소득수익률, not 투자/자본
  assert.ok(c.source.includes('2024년 3분기'));
  assert.ok(c.note?.includes('강남'));
});

test('cap rate falls back to 투자수익률 when 소득수익률 is absent', async () => {
  const { fetcher } = fetcherFor(
    rentBody([['강남', 25, '202403']]),
    vacancyBody([['강남', 4, '202403']]),
    yieldBody([['강남', '투자수익률', 2.5, '202403']])
  );
  const adapter = new LiveReoneRentComps(
    'k',
    undefined,
    8000,
    undefined,
    undefined,
    undefined,
    fetcher
  );
  const c = (await adapter.fetch(GANGNAM, 'OFFICE', 3))[0]!;
  assert.equal(c.capRatePct, 2.5);
});

test('R-ONE adapter returns [] for non-office classes and when no key is set', async () => {
  const { fetcher } = fetcherFor(
    rentBody([['강남', 25, '202403']]),
    vacancyBody([]),
    yieldBody([])
  );
  const adapter = new LiveReoneRentComps(
    'k',
    undefined,
    8000,
    undefined,
    undefined,
    undefined,
    fetcher
  );
  assert.deepEqual(await adapter.fetch(GANGNAM, 'RETAIL', 3), []);
  assert.deepEqual(await adapter.fetch(GANGNAM, 'DATA_CENTER', 3), []);

  const noKey = new LiveReoneRentComps(undefined);
  assert.deepEqual(await noKey.fetch(GANGNAM, 'OFFICE', 3), []);
});
