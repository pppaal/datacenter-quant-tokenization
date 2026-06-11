import assert from 'node:assert/strict';
import test from 'node:test';
import {
  fetchDbnomicsSeries,
  isDbnomicsMacroEnabled,
  type DbnomicsSeriesRef,
  type DbnomicsPoint
} from '@/lib/sources/adapters/dbnomics';

// A realistic DBnomics series endpoint payload (observations=1): a single doc
// holding aligned, oldest-first `period[]` and `value[]` arrays. DBnomics
// encodes missing observations as the string "NA" (and sometimes null), so the
// newest *non-null* observation is the last real value in the arrays.
function dbnomicsPayload(
  ref: { provider: string; dataset: string; series: string },
  rows: Array<[string, number | string | null]>
) {
  return {
    series: {
      docs: [
        {
          provider_code: ref.provider,
          dataset_code: ref.dataset,
          series_code: ref.series,
          series_name: `${ref.provider} ${ref.series}`,
          period: rows.map(([period]) => period),
          value: rows.map(([, value]) => value)
        }
      ]
    }
  };
}

function findPoint(points: DbnomicsPoint[], seriesKey: string, provider: string) {
  return points.find((p) => p.seriesKey === seriesKey && p.provider === provider) ?? null;
}

const SAMPLE_REFS: DbnomicsSeriesRef[] = [
  {
    provider: 'BIS',
    dataset: 'CBPOL',
    series: 'M.KR',
    seriesKey: 'policy_rate_pct',
    label: 'KR Policy Rate',
    unit: '%'
  },
  {
    provider: 'IMF',
    dataset: 'IFS',
    series: 'A.US.PCPI_PC_CP_A_PT',
    seriesKey: 'inflation_pct',
    label: 'US CPI Inflation',
    unit: '%'
  },
  {
    // All-NA coverage → no point emitted (fails closed per-series).
    provider: 'BIS',
    dataset: 'PP',
    series: 'Q.JP.N.628',
    seriesKey: 'residential_property_price_index',
    label: 'JP Property Price',
    unit: 'idx'
  }
];

test('dbnomics adapter parses a sample payload into the newest non-null observation', async () => {
  process.env.ENABLE_DBNOMICS_MACRO = 'true';

  let calls = 0;
  const fetcher = async (url: string) => {
    calls += 1;
    if (url.includes('/BIS/CBPOL/M.KR')) {
      return new Response(
        JSON.stringify(
          dbnomicsPayload({ provider: 'BIS', dataset: 'CBPOL', series: 'M.KR' }, [
            ['2024-01', 3.5],
            ['2024-02', 3.5],
            // Newest period is most recent, but null → skip back to 3.25.
            ['2024-03', 3.25],
            ['2024-04', 'NA']
          ])
        ),
        { status: 200 }
      );
    }
    if (url.includes('/IMF/IFS/A.US.PCPI_PC_CP_A_PT')) {
      return new Response(
        JSON.stringify(
          dbnomicsPayload({ provider: 'IMF', dataset: 'IFS', series: 'A.US.PCPI_PC_CP_A_PT' }, [
            ['2023', 4.1],
            ['2024', 2.9]
          ])
        ),
        { status: 200 }
      );
    }
    // BIS/PP/Q.JP.N.628 → all-NA → adapter drops it.
    return new Response(
      JSON.stringify(
        dbnomicsPayload({ provider: 'BIS', dataset: 'PP', series: 'Q.JP.N.628' }, [
          ['2024-Q1', null],
          ['2024-Q2', 'NA']
        ])
      ),
      { status: 200 }
    );
  };

  const result = await fetchDbnomicsSeries({ seriesRefs: SAMPLE_REFS, fetcher });

  assert.equal(result.provider, 'dbnomics');
  // One fetch per series ref.
  assert.equal(calls, 3);
  // Policy rate + inflation parse; the all-NA property series is dropped.
  assert.equal(result.points.length, 2);

  const policy = findPoint(result.points, 'policy_rate_pct', 'BIS');
  assert.ok(policy, 'expected a BIS policy_rate_pct point');
  assert.equal(policy.value, 3.25); // newest non-null (skips the trailing "NA")
  assert.equal(policy.date, '2024-03');
  assert.equal(policy.unit, '%');
  assert.equal(policy.sourceSystem, 'dbnomics');

  const inflation = findPoint(result.points, 'inflation_pct', 'IMF');
  assert.ok(inflation);
  assert.equal(inflation.value, 2.9);
  assert.equal(inflation.date, '2024');

  assert.equal(findPoint(result.points, 'residential_property_price_index', 'BIS'), null);
  assert.equal(result.error, null);

  delete process.env.ENABLE_DBNOMICS_MACRO;
});

test('dbnomics adapter fails closed (empty points, no throw) when the fetcher errors', async () => {
  process.env.ENABLE_DBNOMICS_MACRO = 'true';

  const fetcher = async () => {
    throw new Error('boom: upstream unreachable');
  };

  const result = await fetchDbnomicsSeries({ seriesRefs: SAMPLE_REFS, fetcher });

  // Never throws into the caller; degrades to an empty point list with a note.
  assert.equal(result.points.length, 0);
  assert.ok(result.error && result.error.includes('boom'), 'error note should be populated');

  delete process.env.ENABLE_DBNOMICS_MACRO;
});

test('dbnomics adapter is gated off by default and returns an empty result', async () => {
  delete process.env.ENABLE_DBNOMICS_MACRO;
  assert.equal(isDbnomicsMacroEnabled(), false);

  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    return new Response('{}', { status: 200 });
  };

  const result = await fetchDbnomicsSeries({ seriesRefs: SAMPLE_REFS, fetcher });
  assert.equal(calls, 0); // never hits the network when disabled
  assert.equal(result.points.length, 0);
  assert.equal(result.error, 'ENABLE_DBNOMICS_MACRO not enabled');
});
