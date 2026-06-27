import assert from 'node:assert/strict';
import test from 'node:test';
import { __resetEnvCache } from '@/lib/env';
import {
  buildOverpassQuery,
  fetchPoiDensity,
  parseCountResponse,
  scoreAmenityDensity,
  OVERPASS_SOURCE,
  POI_CATEGORIES,
  type PoiDensityInput
} from '@/lib/services/dc-intel/overpass-poi';

const SEOUL: PoiDensityInput = {
  latitude: 37.5665,
  longitude: 126.978,
  radiusMeters: 800
};

// A trimmed but realistic Overpass `out count;` response. Overpass returns one
// element of type "count" per `out count;` block, in query order. Our query
// emits blocks in POI_CATEGORIES order: food, retail, transit, office, health,
// education, finance.
const SAMPLE_COUNT_BODY = {
  version: 0.6,
  generator: 'Overpass API',
  elements: [
    { type: 'count', id: 0, tags: { total: '42', nodes: '40', ways: '2', relations: '0' } }, // food
    { type: 'count', id: 0, tags: { total: '30' } }, // retail
    { type: 'count', id: 0, tags: { total: '12' } }, // transit
    { type: 'count', id: 0, tags: { total: '8' } }, // office
    { type: 'count', id: 0, tags: { total: '6' } }, // health
    { type: 'count', id: 0, tags: { total: '5' } }, // education
    { type: 'count', id: 0, tags: { total: '0' } } // finance
  ]
};

const SAMPLE_TOTAL = 42 + 30 + 12 + 8 + 6 + 5 + 0; // 103

function jsonFetcher(body: unknown) {
  return async () => new Response(JSON.stringify(body), { status: 200 });
}

test('buildOverpassQuery emits one count block per category with the radius', () => {
  const query = buildOverpassQuery(SEOUL);
  assert.ok(query.startsWith('[out:json][timeout:25];'));
  // One `out count;` per category.
  const countBlocks = query.match(/out count;/g) ?? [];
  assert.equal(countBlocks.length, POI_CATEGORIES.length);
  // Radius + coordinates wired into the around clause.
  assert.ok(query.includes('(around:800,37.5665,126.978)'));
  // node/way/relation all queried.
  assert.ok(query.includes('node["amenity"~"restaurant'));
  assert.ok(query.includes('way["shop"]'));
  assert.ok(query.includes('relation["office"]'));
});

test('parseCountResponse maps count blocks back to categories in order', () => {
  const byCategory = parseCountResponse(SAMPLE_COUNT_BODY);
  assert.deepEqual(byCategory, {
    food: 42,
    retail: 30,
    transit: 12,
    office: 8,
    health: 6,
    education: 5,
    finance: 0
  });
});

test('parseCountResponse is empty (all zero) on malformed body', () => {
  assert.deepEqual(parseCountResponse(null), {
    food: 0,
    retail: 0,
    transit: 0,
    office: 0,
    health: 0,
    education: 0,
    finance: 0
  });
  assert.equal(parseCountResponse({ elements: 'nope' }).food, 0);
});

test('scoreAmenityDensity is deterministic, bounded, and monotonic', () => {
  const byCategory = parseCountResponse(SAMPLE_COUNT_BODY);
  // Deterministic snapshot: total=103, 6/7 categories present.
  // volumeTerm = 103/(103+120) = 0.46188...
  // diversityTerm = 6/7 = 0.857142...
  // score = 100*(0.6*0.46188 + 0.4*0.857142) = 100*(0.277130 + 0.342857) = 61.999 -> 62.0
  assert.equal(scoreAmenityDensity(byCategory), 62);

  // Bounds.
  assert.equal(
    scoreAmenityDensity({
      food: 0,
      retail: 0,
      transit: 0,
      office: 0,
      health: 0,
      education: 0,
      finance: 0
    }),
    0
  );
  assert.ok(
    scoreAmenityDensity({
      food: 100000,
      retail: 100000,
      transit: 100000,
      office: 100000,
      health: 100000,
      education: 100000,
      finance: 100000
    }) <= 100
  );

  // Monotonic: more amenities never lowers the score.
  const denser = { ...byCategory, finance: 20 };
  assert.ok(scoreAmenityDensity(denser) >= scoreAmenityDensity(byCategory));
});

test('fetchPoiDensity parses the sample and computes the score (enabled)', async () => {
  process.env.ENABLE_OVERPASS_POI = 'true';
  __resetEnvCache();
  const result = await fetchPoiDensity(SEOUL, { fetcher: jsonFetcher(SAMPLE_COUNT_BODY) });

  assert.equal(result.totalPoi, SAMPLE_TOTAL);
  assert.equal(result.byCategory.food, 42);
  assert.equal(result.byCategory.finance, 0);
  assert.equal(result.amenityScore, 62);
  assert.equal(result.source, OVERPASS_SOURCE);
});

test('fetchPoiDensity returns empty (no throw) on fetch error', async () => {
  process.env.ENABLE_OVERPASS_POI = 'true';
  __resetEnvCache();
  const result = await fetchPoiDensity(SEOUL, {
    fetcher: async () => {
      throw new Error('network down');
    },
    timeoutMs: 50
  });

  assert.equal(result.totalPoi, 0);
  assert.equal(result.amenityScore, 0);
  assert.equal(result.source, OVERPASS_SOURCE);
});

test('fetchPoiDensity returns empty (no throw) on HTTP 500', async () => {
  process.env.ENABLE_OVERPASS_POI = 'true';
  __resetEnvCache();
  const result = await fetchPoiDensity(SEOUL, {
    fetcher: async () => new Response('upstream error', { status: 500 }),
    timeoutMs: 50
  });

  assert.equal(result.totalPoi, 0);
  assert.equal(result.amenityScore, 0);
});

test('fetchPoiDensity returns empty on invalid location', async () => {
  process.env.ENABLE_OVERPASS_POI = 'true';
  __resetEnvCache();
  let called = false;
  const result = await fetchPoiDensity(
    { latitude: Number.NaN, longitude: 200 },
    {
      fetcher: async () => {
        called = true;
        return new Response('{}', { status: 200 });
      }
    }
  );

  assert.equal(called, false);
  assert.equal(result.totalPoi, 0);
});

test('fetchPoiDensity is gated off when ENABLE_OVERPASS_POI is unset', async () => {
  delete process.env.ENABLE_OVERPASS_POI;
  __resetEnvCache();
  let called = false;
  const result = await fetchPoiDensity(SEOUL, {
    fetcher: async () => {
      called = true;
      return new Response('{}', { status: 200 });
    }
  });

  assert.equal(called, false);
  assert.equal(result.totalPoi, 0);
});
