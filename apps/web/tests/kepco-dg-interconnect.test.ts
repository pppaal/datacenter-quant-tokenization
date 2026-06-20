import assert from 'node:assert/strict';
import test from 'node:test';
import {
  fetchDgInterconnects,
  KEPCO_DG_SOURCE,
  parseDgInterconnects
} from '@/lib/sources/adapters/kepco-dg-interconnect';

const SAMPLE_XML = `<response><body><items>
  <item>
    <substNm>안성변전소</substNm><branchNm>경기지역본부</branchNm>
    <voltLvl>154</voltLvl><cnctCapa>120.5</cnctCapa><avlblCapa>45.0</avlblCapa>
  </item>
  <item>
    <substNm>용인변전소</substNm><voltLvl>345</voltLvl>
    <cnctCapa>300</cnctCapa><avlblCapa>0</avlblCapa>
  </item>
  <item><branchNm>주소없음</branchNm></item>
</items></body></response>`;

function textFetcher(body: string) {
  return async () => new Response(body, { status: 200 });
}

test('parseDgInterconnects reads substation, branch, voltage, capacities', () => {
  const rows = parseDgInterconnects(SAMPLE_XML);
  // The third item has no substation name and is skipped.
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    substation: '안성변전소',
    branch: '경기지역본부',
    voltageKv: 154,
    connectedMw: 120.5,
    availableMw: 45.0
  });
  assert.equal(rows[1].availableMw, 0);
  assert.equal(rows[1].branch, null);
});

test('fetchDgInterconnects fails closed without the key', async () => {
  const prev = process.env.KEPCO_DG_SERVICE_KEY;
  delete process.env.KEPCO_DG_SERVICE_KEY;
  try {
    const result = await fetchDgInterconnects({ fetcher: textFetcher(SAMPLE_XML) });
    assert.equal(result.interconnects.length, 0);
    assert.match(result.error ?? '', /KEPCO_DG_SERVICE_KEY not set/);
    assert.equal(result.source, KEPCO_DG_SOURCE);
  } finally {
    if (prev !== undefined) process.env.KEPCO_DG_SERVICE_KEY = prev;
  }
});

test('fetchDgInterconnects parses items when the key is set', async () => {
  const prev = process.env.KEPCO_DG_SERVICE_KEY;
  process.env.KEPCO_DG_SERVICE_KEY = 'test-key';
  try {
    const result = await fetchDgInterconnects({ region: '경기', fetcher: textFetcher(SAMPLE_XML) });
    assert.equal(result.interconnects.length, 2);
    assert.equal(result.error, null);
  } finally {
    if (prev !== undefined) process.env.KEPCO_DG_SERVICE_KEY = prev;
    else delete process.env.KEPCO_DG_SERVICE_KEY;
  }
});

test('fetchDgInterconnects fails closed (note, not throw) on a fetch error', async () => {
  const prev = process.env.KEPCO_DG_SERVICE_KEY;
  process.env.KEPCO_DG_SERVICE_KEY = 'test-key';
  try {
    const result = await fetchDgInterconnects({
      fetcher: async () => {
        throw new Error('timeout');
      }
    });
    assert.equal(result.interconnects.length, 0);
    assert.match(result.error ?? '', /timeout/);
  } finally {
    if (prev !== undefined) process.env.KEPCO_DG_SERVICE_KEY = prev;
    else delete process.env.KEPCO_DG_SERVICE_KEY;
  }
});
