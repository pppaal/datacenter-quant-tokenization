import assert from 'node:assert/strict';
import test from 'node:test';
import {
  fetchInterconnectionSignal,
  parseFacilities,
  scoreInterconnectionDensity,
  type PeeringDbLocationInput
} from '@/lib/services/dc-intel/peeringdb';

const SEOUL: PeeringDbLocationInput = {
  latitude: 37.5665,
  longitude: 126.978,
  country: 'KR',
  boxDegrees: 0.5
};

// A trimmed but realistic PeeringDB /api/fac response body.
const SAMPLE_FAC_BODY = {
  data: [
    {
      id: 1,
      name: 'Seoul KINX Gasan',
      city: 'Seoul',
      country: 'KR',
      latitude: 37.48,
      longitude: 126.88,
      net_count: 40
    },
    {
      id: 2,
      name: 'Seoul Digital Realty ICN10',
      city: 'Seoul',
      country: 'KR',
      latitude: 37.55,
      longitude: 127.0,
      net_count: 25
    },
    {
      // Outside the bounding box (Busan) — must be filtered out.
      id: 3,
      name: 'Busan Facility',
      city: 'Busan',
      country: 'KR',
      latitude: 35.18,
      longitude: 129.08,
      net_count: 100
    },
    {
      // Wrong country — must be filtered out.
      id: 4,
      name: 'Tokyo Facility',
      city: 'Tokyo',
      country: 'JP',
      latitude: 35.68,
      longitude: 139.69,
      net_count: 300
    }
  ]
};

function jsonFetcher(body: unknown) {
  return async () => new Response(JSON.stringify(body), { status: 200 });
}

test('parseFacilities applies the bounding-box + country filter', () => {
  const facilities = parseFacilities(SAMPLE_FAC_BODY, SEOUL);
  assert.equal(facilities.length, 2);
  assert.deepEqual(
    facilities.map((f) => f.id).sort((a, b) => a - b),
    [1, 2]
  );
});

test('scoreInterconnectionDensity is deterministic, bounded, and monotonic', () => {
  // Deterministic snapshot for the sample (2 facilities, 65 networks).
  const score = scoreInterconnectionDensity(2, 65);
  assert.equal(score, 21);

  // Bounds.
  assert.equal(scoreInterconnectionDensity(0, 0), 0);
  assert.ok(scoreInterconnectionDensity(1000, 100000) <= 100);

  // Monotonic: more density never lowers the score.
  assert.ok(scoreInterconnectionDensity(5, 200) >= scoreInterconnectionDensity(2, 65));
});

test('fetchInterconnectionSignal parses the sample and computes the score (enabled)', async () => {
  process.env.ENABLE_PEERINGDB = 'true';
  const result = await fetchInterconnectionSignal(SEOUL, {
    fetcher: jsonFetcher(SAMPLE_FAC_BODY)
  });

  assert.equal(result.facilityCount, 2);
  assert.equal(result.totalNetworks, 65);
  assert.equal(result.interconnectionScore, 21);
  assert.equal(result.facilities.length, 2);
});

test('fetchInterconnectionSignal returns empty (no throw) on fetch error', async () => {
  process.env.ENABLE_PEERINGDB = 'true';
  const result = await fetchInterconnectionSignal(SEOUL, {
    fetcher: async () => {
      throw new Error('network down');
    },
    timeoutMs: 50
  });

  assert.deepEqual(result, {
    facilities: [],
    facilityCount: 0,
    totalNetworks: 0,
    interconnectionScore: 0
  });
});

test('fetchInterconnectionSignal returns empty (no throw) on HTTP 500', async () => {
  process.env.ENABLE_PEERINGDB = 'true';
  const result = await fetchInterconnectionSignal(SEOUL, {
    fetcher: async () => new Response('upstream error', { status: 500 }),
    timeoutMs: 50
  });

  assert.equal(result.facilityCount, 0);
  assert.equal(result.interconnectionScore, 0);
});

test('fetchInterconnectionSignal is gated off when ENABLE_PEERINGDB is unset', async () => {
  delete process.env.ENABLE_PEERINGDB;
  let called = false;
  const result = await fetchInterconnectionSignal(SEOUL, {
    fetcher: async () => {
      called = true;
      return new Response('{}', { status: 200 });
    }
  });

  assert.equal(called, false);
  assert.equal(result.facilityCount, 0);
});
