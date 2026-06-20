import assert from 'node:assert/strict';
import test from 'node:test';
import {
  fetchFloodDepthStats,
  floodScoreFromAreas,
  HRFCO_FLOOD_SOURCE,
  parseFloodDepthStats,
  type FloodDepthAreas
} from '@/lib/sources/adapters/hrfco-flood';

const SAMPLE_XML = `<response><body><items>
  <item>
    <wtrshedNm>한강서울</wtrshedNm><frqncyNm>100년</frqncyNm>
    <area05Under>1.2</area05Under><area0510>0.8</area0510>
    <area1020>0.5</area1020><area2050>0.2</area2050><area50Over>0.1</area50Over>
  </item>
  <item>
    <wtrshedNm>낙동강</wtrshedNm><frqncyNm>기왕최대</frqncyNm>
    <area05Under>3.0</area05Under><area0510>0</area0510>
    <area1020>0</area1020><area2050>0</area2050><area50Over>0</area50Over>
  </item>
</items></body></response>`;

function textFetcher(body: string) {
  return async () => new Response(body, { status: 200 });
}

const allShallow: FloodDepthAreas = { d0_5: 5, d0_5_1: 0, d1_2: 0, d2_5: 0, d5_plus: 0 };
const allDeep: FloodDepthAreas = { d0_5: 0, d0_5_1: 0, d1_2: 0, d2_5: 0, d5_plus: 5 };
const noFlood: FloodDepthAreas = { d0_5: 0, d0_5_1: 0, d1_2: 0, d2_5: 0, d5_plus: 0 };

test('floodScoreFromAreas: all-shallow→1, all-deep→5, no-flood→0', () => {
  assert.equal(floodScoreFromAreas(allShallow), 1);
  assert.equal(floodScoreFromAreas(allDeep), 5);
  assert.equal(floodScoreFromAreas(noFlood), 0);
});

test('floodScoreFromAreas is area-weighted between the extremes', () => {
  const score = floodScoreFromAreas(allShallow);
  const mixed = floodScoreFromAreas({ ...allShallow, d5_plus: 5 });
  assert.ok(mixed > score && mixed < 5);
});

test('parseFloodDepthStats reads basin, frequency, depth areas, and total', () => {
  const stats = parseFloodDepthStats(SAMPLE_XML);
  assert.equal(stats.length, 2);
  assert.equal(stats[0].basin, '한강서울');
  assert.equal(stats[0].frequency, '100');
  assert.equal(stats[0].areasKm2.d5_plus, 0.1);
  assert.equal(stats[0].totalAreaKm2, 2.8);
  // 기왕최대 normalizes to 'max'; all-shallow → score 1.
  assert.equal(stats[1].frequency, 'max');
  assert.equal(stats[1].floodScore, 1);
});

test('fetchFloodDepthStats fails closed without the key', async () => {
  const prev = process.env.HRFCO_FLOOD_SERVICE_KEY;
  delete process.env.HRFCO_FLOOD_SERVICE_KEY;
  try {
    const result = await fetchFloodDepthStats({ fetcher: textFetcher(SAMPLE_XML) });
    assert.equal(result.stats.length, 0);
    assert.match(result.error ?? '', /HRFCO_FLOOD_SERVICE_KEY not set/);
    assert.equal(result.source, HRFCO_FLOOD_SOURCE);
  } finally {
    if (prev !== undefined) process.env.HRFCO_FLOOD_SERVICE_KEY = prev;
  }
});

test('fetchFloodDepthStats parses items when the key is set', async () => {
  const prev = process.env.HRFCO_FLOOD_SERVICE_KEY;
  process.env.HRFCO_FLOOD_SERVICE_KEY = 'test-key';
  try {
    const result = await fetchFloodDepthStats({ fetcher: textFetcher(SAMPLE_XML) });
    assert.equal(result.stats.length, 2);
    assert.equal(result.error, null);
  } finally {
    if (prev !== undefined) process.env.HRFCO_FLOOD_SERVICE_KEY = prev;
    else delete process.env.HRFCO_FLOOD_SERVICE_KEY;
  }
});
