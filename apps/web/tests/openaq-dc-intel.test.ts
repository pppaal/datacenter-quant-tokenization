import assert from 'node:assert/strict';
import test from 'node:test';
import {
  fetchAirQuality,
  parseAirQuality,
  OPENAQ_SOURCE,
  type AirQualityInput
} from '@/lib/services/dc-intel/openaq';

const SEOUL: AirQualityInput = {
  latitude: 37.5665,
  longitude: 126.978,
  radiusMeters: 10_000
};

// A trimmed but realistic OpenAQ v3 /locations response.
const SAMPLE_LOCATIONS = {
  results: [
    { id: 101, name: 'Seoul Jung-gu', coordinates: { latitude: 37.56, longitude: 126.98 } },
    { id: 102, name: 'Seoul Mapo-gu', coordinates: { latitude: 37.55, longitude: 126.91 } }
  ]
};

// Per-location /latest bodies, keyed implicitly by call order (id 101, 102).
const SAMPLE_LATEST_101 = {
  results: [
    { parameter: { name: 'pm25' }, value: 18, datetime: { utc: '2026-06-10T03:00:00Z' } },
    { parameter: { name: 'pm10' }, value: 40, datetime: { utc: '2026-06-10T03:00:00Z' } },
    { parameter: { name: 'no2' }, value: 22, datetime: { utc: '2026-06-10T03:00:00Z' } }
  ]
};
const SAMPLE_LATEST_102 = {
  results: [
    { parameter: { name: 'pm25' }, value: 22, datetime: { utc: '2026-06-10T04:00:00Z' } },
    { parameter: { name: 'o3' }, value: 31, datetime: '2026-06-10T04:00:00Z' },
    // Unknown pollutant — must be ignored.
    { parameter: { name: 'so2' }, value: 5, datetime: '2026-06-10T04:00:00Z' }
  ]
};

test('parseAirQuality averages per pollutant across stations and tracks asOf', () => {
  const result = parseAirQuality(SAMPLE_LOCATIONS, [SAMPLE_LATEST_101, SAMPLE_LATEST_102]);

  assert.equal(result.stationCount, 2);
  assert.equal(result.pm25, 20); // mean(18, 22)
  assert.equal(result.pm10, 40); // only station 101 reports it
  assert.equal(result.no2, 22);
  assert.equal(result.o3, 31);
  assert.equal(result.asOf, '2026-06-10T04:00:00Z'); // most recent across all rows
  assert.equal(result.source, OPENAQ_SOURCE);
  // so2 is not a tracked pollutant and must not leak through.
  assert.ok(!('so2' in result));
});

test('parseAirQuality asOf is the chronologically latest reading across UTC offsets', () => {
  // Two readings for the same pollutant whose ISO strings sort DIFFERENTLY as
  // text than in real time:
  //   "…T12:00:00+09:00" = 2026-06-10T03:00:00Z  (earlier instant, sorts LATER as text)
  //   "…T04:00:00Z"      = 2026-06-10T04:00:00Z  (later instant, sorts EARLIER as text)
  const stationOffset = {
    results: [{ parameter: { name: 'pm25' }, value: 18, datetime: '2026-06-10T12:00:00+09:00' }]
  };
  const stationUtc = {
    results: [{ parameter: { name: 'pm25' }, value: 22, datetime: '2026-06-10T04:00:00Z' }]
  };

  // Feed the later-instant reading SECOND and FIRST to prove order-independence.
  const a = parseAirQuality({ results: [{ id: 1 }, { id: 2 }] }, [stationOffset, stationUtc]);
  const b = parseAirQuality({ results: [{ id: 1 }, { id: 2 }] }, [stationUtc, stationOffset]);

  // The true latest instant is the +0900 reading at 03:00Z? No — 04:00Z is later.
  // Both orderings must resolve to the 04:00Z reading, not the lexically-larger
  // "12:00:00+09:00" string.
  assert.equal(a.asOf, '2026-06-10T04:00:00Z');
  assert.equal(b.asOf, '2026-06-10T04:00:00Z');
});

test('fetchAirQuality parses the live two-step payload (key set)', async () => {
  process.env.OPENAQ_API_KEY = 'test-key';
  const calls: string[] = [];
  const fetcher = async (url: string, init?: RequestInit) => {
    calls.push(url);
    // Assert the API key header is forwarded.
    const headers = init?.headers as Record<string, string> | undefined;
    assert.equal(headers?.['X-API-Key'], 'test-key');

    if (url.includes('/locations/101/latest'))
      return new Response(JSON.stringify(SAMPLE_LATEST_101), { status: 200 });
    if (url.includes('/locations/102/latest'))
      return new Response(JSON.stringify(SAMPLE_LATEST_102), { status: 200 });
    if (url.includes('/locations'))
      return new Response(JSON.stringify(SAMPLE_LOCATIONS), { status: 200 });
    throw new Error(`unexpected url ${url}`);
  };

  const result = await fetchAirQuality(SEOUL, { fetcher });
  assert.equal(result.stationCount, 2);
  assert.equal(result.pm25, 20);
  assert.equal(result.no2, 22);
  assert.equal(result.source, OPENAQ_SOURCE);

  // First call is /locations, then one /latest per matched location.
  assert.ok(calls[0].includes('/locations?'));
  assert.ok(calls.some((u) => u.includes('/locations/101/latest')));
  assert.ok(calls.some((u) => u.includes('/locations/102/latest')));
  // Radius is forwarded.
  assert.ok(calls[0].includes('radius=10000'));
});

test('fetchAirQuality fails closed (no key → empty, no network call)', async () => {
  delete process.env.OPENAQ_API_KEY;
  let called = false;
  const result = await fetchAirQuality(SEOUL, {
    fetcher: async () => {
      called = true;
      return new Response('{}', { status: 200 });
    }
  });

  assert.equal(called, false);
  assert.deepEqual(result, { stationCount: 0, source: OPENAQ_SOURCE });
});

test('fetchAirQuality returns empty (no throw) on fetch error', async () => {
  process.env.OPENAQ_API_KEY = 'test-key';
  const result = await fetchAirQuality(SEOUL, {
    fetcher: async () => {
      throw new Error('network down');
    },
    timeoutMs: 50
  });

  assert.deepEqual(result, { stationCount: 0, source: OPENAQ_SOURCE });
});

test('fetchAirQuality returns empty (no throw) on HTTP 500', async () => {
  process.env.OPENAQ_API_KEY = 'test-key';
  const result = await fetchAirQuality(SEOUL, {
    fetcher: async () => new Response('upstream error', { status: 500 }),
    timeoutMs: 50
  });

  assert.equal(result.stationCount, 0);
  assert.equal(result.source, OPENAQ_SOURCE);
});

test('fetchAirQuality short-circuits when no stations are nearby', async () => {
  process.env.OPENAQ_API_KEY = 'test-key';
  let latestCalled = false;
  const result = await fetchAirQuality(SEOUL, {
    fetcher: async (url: string) => {
      if (url.includes('/latest')) latestCalled = true;
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    }
  });

  assert.equal(result.stationCount, 0);
  assert.equal(latestCalled, false);
});
