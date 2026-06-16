import assert from 'node:assert/strict';
import test from 'node:test';
import {
  fetchSiteHazards,
  parseHazardReport,
  scoreSiteHazards,
  THINKHAZARD_SOURCE,
  type SiteHazard
} from '@/lib/services/dc-intel/thinkhazard';

// A trimmed but realistic ThinkHazard! /report/{id}.json response body, using
// the documented `hazardtype`/`hazardlevel` objects with `mnemonic` fields.
const SAMPLE_REPORT = [
  {
    hazardtype: { mnemonic: 'EQ', title: 'Earthquake' },
    hazardlevel: { mnemonic: 'HIG', title: 'High' }
  },
  {
    hazardtype: { mnemonic: 'FL', title: 'River flood' },
    hazardlevel: { mnemonic: 'MED', title: 'Medium' }
  },
  {
    hazardtype: { mnemonic: 'CF', title: 'Coastal flood' },
    hazardlevel: { mnemonic: 'LOW', title: 'Low' }
  },
  {
    hazardtype: { mnemonic: 'UF', title: 'Urban flood' },
    hazardlevel: { mnemonic: 'VLO', title: 'Very low' }
  },
  // Unknown hazard type — must be skipped without throwing.
  { hazardtype: { mnemonic: 'ZZ', title: 'Unknown' }, hazardlevel: { mnemonic: 'HIG' } }
];

function jsonFetcher(bodyByUrl: (url: string) => unknown) {
  return async (url: string) => new Response(JSON.stringify(bodyByUrl(url)), { status: 200 });
}

test('parseHazardReport normalizes the 4 known hazards and skips unknowns', () => {
  const hazards = parseHazardReport(SAMPLE_REPORT);
  assert.deepEqual(hazards, [
    { hazardType: 'earthquake', level: 'High' },
    { hazardType: 'river_flood', level: 'Medium' },
    { hazardType: 'coastal_flood', level: 'Low' },
    { hazardType: 'urban_flood', level: 'Very Low' }
  ] satisfies SiteHazard[]);
});

test('parseHazardReport accepts an object-wrapped array', () => {
  const hazards = parseHazardReport({ hazards: SAMPLE_REPORT });
  assert.equal(hazards.length, 4);
});

test('scoreSiteHazards is deterministic, bounded, and monotonic', () => {
  // Deterministic snapshot for the sample (EQ High, FL Med, CF Low, UF VeryLow):
  //   weightedSum = 1.0*1 + 0.9*(2/3) + 0.9*(1/3) + 0.8*0 = 1.9
  //   weightTotal = 1.0 + 0.9 + 0.9 + 0.8 = 3.6
  //   score = 100 * 1.9 / 3.6 = 52.8
  const score = scoreSiteHazards(parseHazardReport(SAMPLE_REPORT));
  assert.equal(score, 52.8);

  // Bounds: all Very Low → 0, all High → 100.
  assert.equal(scoreSiteHazards([{ hazardType: 'earthquake', level: 'Very Low' }]), 0);
  assert.equal(
    scoreSiteHazards([
      { hazardType: 'earthquake', level: 'High' },
      { hazardType: 'tsunami', level: 'High' }
    ]),
    100
  );
  assert.equal(scoreSiteHazards([]), 0);

  // Monotonic: raising a level never lowers the score.
  const lower = scoreSiteHazards([{ hazardType: 'earthquake', level: 'Low' }]);
  const higher = scoreSiteHazards([{ hazardType: 'earthquake', level: 'High' }]);
  assert.ok(higher >= lower);
});

test('fetchSiteHazards fetches the report for an explicit adminId and scores', async () => {
  process.env.ENABLE_THINKHAZARD = 'true';
  let reportUrl = '';
  const result = await fetchSiteHazards(
    { adminId: 1234 },
    {
      fetcher: jsonFetcher((url) => {
        reportUrl = url;
        return SAMPLE_REPORT;
      })
    }
  );

  assert.ok(reportUrl.includes('/report/1234.json'));
  assert.equal(result.hazards.length, 4);
  assert.equal(result.overallRiskScore, 52.8);
  assert.deepEqual(result.highRiskHazards, ['earthquake']);
  assert.equal(result.source, THINKHAZARD_SOURCE);
});

test('fetchSiteHazards returns empty for coordinate input without calling the API', async () => {
  // The public ThinkHazard API has no coordinate→division lookup, so a
  // coordinate-only call must fail soft to empty and make NO request.
  process.env.ENABLE_THINKHAZARD = 'true';
  let called = false;
  const result = await fetchSiteHazards(
    { latitude: 37.5665, longitude: 126.978 },
    {
      fetcher: async () => {
        called = true;
        return new Response('[]', { status: 200 });
      }
    }
  );

  assert.equal(called, false);
  assert.equal(result.hazards.length, 0);
  assert.equal(result.overallRiskScore, 0);
  assert.equal(result.source, THINKHAZARD_SOURCE);
});

test('fetchSiteHazards returns empty (no throw) on fetch error', async () => {
  process.env.ENABLE_THINKHAZARD = 'true';
  const result = await fetchSiteHazards(
    { adminId: 1234 },
    {
      fetcher: async () => {
        throw new Error('network down');
      },
      timeoutMs: 50
    }
  );

  assert.deepEqual(result, {
    hazards: [],
    overallRiskScore: 0,
    highRiskHazards: [],
    source: THINKHAZARD_SOURCE
  });
});

test('fetchSiteHazards returns empty (no throw) on HTTP 500', async () => {
  process.env.ENABLE_THINKHAZARD = 'true';
  const result = await fetchSiteHazards(
    { adminId: 1234 },
    { fetcher: async () => new Response('upstream error', { status: 500 }), timeoutMs: 50 }
  );
  assert.equal(result.overallRiskScore, 0);
  assert.equal(result.hazards.length, 0);
});

test('fetchSiteHazards is gated off when ENABLE_THINKHAZARD is unset', async () => {
  delete process.env.ENABLE_THINKHAZARD;
  let called = false;
  const result = await fetchSiteHazards(
    { adminId: 1234 },
    {
      fetcher: async () => {
        called = true;
        return new Response('[]', { status: 200 });
      }
    }
  );

  assert.equal(called, false);
  assert.equal(result.hazards.length, 0);
  assert.equal(result.source, THINKHAZARD_SOURCE);
});
