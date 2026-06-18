import assert from 'node:assert/strict';
import test from 'node:test';
import { LiveReoneRentComps, resolveReoneRegion } from '@/lib/services/public-data/live/rone-rent';
import type { fetchWithTimeout } from '@/lib/services/public-data/fetch-with-timeout';

/**
 * Pins the R-ONE 상업용부동산 임대동향(오피스) adapter against the real API
 * response shape (confirmed live): rows under SttsApiTblData[1].row[], rent in
 * 천원/㎡ (must ×1000 → 원/㎡), region in CLS_NM, latest quarter by
 * WRTTIME_IDTFR_ID, vacancy → occupancy.
 */

const GANGNAM = { latitude: 37.5, longitude: 127.04 };

// Minimal real-shaped bodies; the fetcher routes by STATBL_ID in the URL.
function rentBody(rows: Array<[string, number, string]>) {
  return {
    SttsApiTblData: [
      { head: [{ list_total_count: rows.length }] },
      {
        row: rows.map(([CLS_NM, DTA_VAL, WRTTIME_IDTFR_ID]) => ({
          CLS_NM,
          DTA_VAL,
          UI_NM: '천원/㎡',
          ITM_NM: '임대료',
          WRTTIME_IDTFR_ID,
          WRTTIME_DESC: '2024년 3분기'
        }))
      }
    ]
  };
}
function vacancyBody(rows: Array<[string, number, string]>) {
  return {
    SttsApiTblData: [
      { head: [{ list_total_count: rows.length }] },
      {
        row: rows.map(([CLS_NM, DTA_VAL, WRTTIME_IDTFR_ID]) => ({
          CLS_NM,
          DTA_VAL,
          UI_NM: '%',
          ITM_NM: '공실률',
          WRTTIME_IDTFR_ID,
          WRTTIME_DESC: '2024년 3분기'
        }))
      }
    ]
  };
}

function fetcherFor(rent: unknown, vacancy: unknown) {
  const calls: string[] = [];
  const fetcher = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const isRent = url.includes('TT249843134237374') || url.includes('STATBL_ID=RENT');
    return { ok: true, json: async () => (isRent ? rent : vacancy) } as Response;
  }) as typeof fetchWithTimeout;
  return { calls, fetcher };
}

test('resolveReoneRegion maps Gangnam coords to the 강남 권역', () => {
  assert.equal(resolveReoneRegion(GANGNAM).clsNm, '강남');
  assert.equal(resolveReoneRegion({ latitude: 37.57, longitude: 126.98 }).clsNm, '도심');
});

test('R-ONE office adapter converts 천원/㎡ → 원/㎡ and vacancy → occupancy', async () => {
  // Two quarters present; the adapter must pick the latest (202403 > 202402).
  const { fetcher } = fetcherFor(
    rentBody([
      ['강남', 24.0, '202402'],
      ['강남', 25.3742867548887, '202403'],
      ['도심', 29.67, '202403']
    ]),
    vacancyBody([['강남', 5.5, '202403']])
  );
  const adapter = new LiveReoneRentComps(
    'test-key',
    undefined,
    8000,
    undefined,
    undefined,
    fetcher
  );

  const comps = await adapter.fetch(GANGNAM, 'OFFICE', 3);
  assert.equal(comps.length, 1);
  const c = comps[0]!;
  // 25.3742... 천원/㎡ × 1000, rounded → 25374 원/㎡.
  assert.equal(c.monthlyRentKrwPerSqm, 25374);
  // vacancy 5.5% → occupancy 94.5%.
  assert.equal(c.occupancyPct, 94.5);
  assert.equal(c.capRatePct, null);
  assert.ok(c.source.includes('2024년 3분기'));
  assert.ok(c.note?.includes('강남'));
});

test('R-ONE adapter returns [] for non-office classes and when no key is set', async () => {
  const { fetcher } = fetcherFor(rentBody([['강남', 25, '202403']]), vacancyBody([]));
  const adapter = new LiveReoneRentComps('k', undefined, 8000, undefined, undefined, fetcher);
  assert.deepEqual(await adapter.fetch(GANGNAM, 'RETAIL', 3), []);
  assert.deepEqual(await adapter.fetch(GANGNAM, 'DATA_CENTER', 3), []);

  const noKey = new LiveReoneRentComps(undefined);
  assert.deepEqual(await noKey.fetch(GANGNAM, 'OFFICE', 3), []);
});
