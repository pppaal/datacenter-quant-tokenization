import assert from 'node:assert/strict';
import test from 'node:test';
import {
  fetchBondYields,
  KOFIA_BOND_SOURCE,
  parseBondYieldRows,
  tenorLabelToYears
} from '@/lib/sources/adapters/kofia-bond-yields';

const SAMPLE_XML = `<result><standardDt>20260619</standardDt>
  <item><gradeNm>국고</gradeNm><tenorNm>3Y</tenorNm><yld>3.12</yld></item>
  <item><gradeNm>AA-</gradeNm><tenorNm>3Y</tenorNm><yld>3.78</yld></item>
  <item><gradeNm>BBB-</gradeNm><tenorNm>3Y</tenorNm><yld>9.85</yld></item>
  <item><gradeNm>AA-</gradeNm><tenorNm>6M</tenorNm><yld>3.40</yld></item>
  <item><gradeNm>nope</gradeNm><tenorNm>3Y</tenorNm></item>
</result>`;

function textFetcher(body: string) {
  return async () => new Response(body, { status: 200 });
}

test('tenorLabelToYears handles Y/M labels and bare numbers', () => {
  assert.equal(tenorLabelToYears('3Y'), 3);
  assert.equal(tenorLabelToYears('6M'), 0.5);
  assert.equal(tenorLabelToYears('10'), 10);
  assert.equal(tenorLabelToYears(null), null);
  assert.equal(tenorLabelToYears('junk'), null);
});

test('parseBondYieldRows reads asOf, grades, tenors, yields and skips incomplete rows', () => {
  const { asOf, points } = parseBondYieldRows(SAMPLE_XML);
  assert.equal(asOf, '20260619');
  // The last item has no yield and is skipped.
  assert.equal(points.length, 4);
  assert.deepEqual(points[0], { grade: '국고', tenorLabel: '3Y', tenorYears: 3, yieldPct: 3.12 });
  // Spread of BBB- over 국고 at 3Y = 9.85 - 3.12 = 6.73pp (sanity, monotonic by risk).
  const govt = points.find((p) => p.grade === '국고' && p.tenorLabel === '3Y')!;
  const bbb = points.find((p) => p.grade === 'BBB-' && p.tenorLabel === '3Y')!;
  assert.ok(bbb.yieldPct > govt.yieldPct);
});

test('fetchBondYields fails closed without the key', async () => {
  const prev = process.env.KOFIA_API_KEY;
  delete process.env.KOFIA_API_KEY;
  try {
    const result = await fetchBondYields({ fetcher: textFetcher(SAMPLE_XML) });
    assert.equal(result.points.length, 0);
    assert.match(result.error ?? '', /KOFIA_API_KEY not set/);
    assert.equal(result.source, KOFIA_BOND_SOURCE);
  } finally {
    if (prev !== undefined) process.env.KOFIA_API_KEY = prev;
  }
});

test('fetchBondYields parses rows when the key is set', async () => {
  const prev = process.env.KOFIA_API_KEY;
  process.env.KOFIA_API_KEY = 'test-key';
  try {
    const result = await fetchBondYields({ fetcher: textFetcher(SAMPLE_XML) });
    assert.equal(result.points.length, 4);
    assert.equal(result.asOf, '20260619');
    assert.equal(result.error, null);
  } finally {
    if (prev !== undefined) process.env.KOFIA_API_KEY = prev;
    else delete process.env.KOFIA_API_KEY;
  }
});

test('fetchBondYields fails closed (note, not throw) on a fetch error', async () => {
  const prev = process.env.KOFIA_API_KEY;
  process.env.KOFIA_API_KEY = 'test-key';
  try {
    const result = await fetchBondYields({
      fetcher: async () => {
        throw new Error('500');
      }
    });
    assert.equal(result.points.length, 0);
    assert.match(result.error ?? '', /500/);
  } finally {
    if (prev !== undefined) process.env.KOFIA_API_KEY = prev;
    else delete process.env.KOFIA_API_KEY;
  }
});
