import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchKpxSmp, KPX_SMP_SOURCE, parseSmpItems } from '@/lib/sources/adapters/kpx-smp';

const SAMPLE_XML = `<response><body><items>
  <item><baseDt>20260619</baseDt><hr>1</hr><lhSmp>121.34</lhSmp><jjSmp>140.10</jjSmp></item>
  <item><baseDt>20260619</baseDt><hr>2</hr><lhSmp>118.90</lhSmp><jjSmp>139.55</jjSmp></item>
  <item><baseDt>20260619</baseDt><hr>3</hr><lhSmp>0</lhSmp><jjSmp>0</jjSmp></item>
</items></body></response>`;

function textFetcher(body: string) {
  return async () => new Response(body, { status: 200 });
}

test('parseSmpItems reads 육지/제주 SMP and hour from tolerant tags', () => {
  const points = parseSmpItems(SAMPLE_XML);
  assert.equal(points.length, 3);
  assert.deepEqual(points[0], {
    date: '20260619',
    hour: 1,
    landKrwPerKwh: 121.34,
    jejuKrwPerKwh: 140.1
  });
});

test('parseSmpItems skips items with no date', () => {
  const points = parseSmpItems('<item><lhSmp>100</lhSmp></item>');
  assert.equal(points.length, 0);
});

test('fetchKpxSmp fails closed when the key is unset', async () => {
  const prev = process.env.KPX_SMP_SERVICE_KEY;
  delete process.env.KPX_SMP_SERVICE_KEY;
  try {
    const result = await fetchKpxSmp({ fetcher: textFetcher(SAMPLE_XML) });
    assert.equal(result.points.length, 0);
    assert.equal(result.landAverageKrwPerKwh, null);
    assert.match(result.error ?? '', /KPX_SMP_SERVICE_KEY not set/);
    assert.equal(result.source, KPX_SMP_SOURCE);
  } finally {
    if (prev !== undefined) process.env.KPX_SMP_SERVICE_KEY = prev;
  }
});

test('fetchKpxSmp parses and averages the 육지 SMP when the key is set', async () => {
  const prev = process.env.KPX_SMP_SERVICE_KEY;
  process.env.KPX_SMP_SERVICE_KEY = 'test-key';
  try {
    const result = await fetchKpxSmp({ tradeDay: '20260619', fetcher: textFetcher(SAMPLE_XML) });
    assert.equal(result.points.length, 3);
    assert.equal(result.error, null);
    // (121.34 + 118.90 + 0) / 3 = 80.08
    assert.equal(result.landAverageKrwPerKwh, 80.08);
  } finally {
    if (prev !== undefined) process.env.KPX_SMP_SERVICE_KEY = prev;
    else delete process.env.KPX_SMP_SERVICE_KEY;
  }
});

test('fetchKpxSmp fails closed (note, not throw) on a fetch error', async () => {
  const prev = process.env.KPX_SMP_SERVICE_KEY;
  process.env.KPX_SMP_SERVICE_KEY = 'test-key';
  try {
    const result = await fetchKpxSmp({
      fetcher: async () => {
        throw new Error('network down');
      }
    });
    assert.equal(result.points.length, 0);
    assert.match(result.error ?? '', /network down/);
  } finally {
    if (prev !== undefined) process.env.KPX_SMP_SERVICE_KEY = prev;
    else delete process.env.KPX_SMP_SERVICE_KEY;
  }
});
