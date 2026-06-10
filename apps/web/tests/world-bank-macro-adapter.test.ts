import assert from 'node:assert/strict';
import test from 'node:test';
import {
  fetchWorldBankMacro,
  isWorldBankMacroEnabled,
  type WorldwideMacroPoint
} from '@/lib/sources/adapters/world-bank';

// A realistic World Bank Indicators API payload: a 2-element array whose
// [0] is paging metadata and [1] is the observation list, newest-first,
// with leading null observations (the API pads recent years before data
// is published).
function worldBankPayload(indicatorId: string, rows: Array<[string, number | null]>) {
  return [
    { page: 1, pages: 1, per_page: 60, total: rows.length },
    rows.map(([date, value]) => ({
      indicator: { id: indicatorId, value: 'Indicator' },
      country: { id: 'KR', value: 'Korea, Rep.' },
      countryiso3code: 'KOR',
      date,
      value
    }))
  ];
}

function findPoint(points: WorldwideMacroPoint[], seriesKey: string) {
  return points.find((p) => p.seriesKey === seriesKey) ?? null;
}

test('world bank adapter parses a sample payload into the newest non-null observation', async () => {
  process.env.ENABLE_WORLD_BANK_MACRO = 'true';

  let calls = 0;
  const fetcher = async (url: string) => {
    calls += 1;
    // Route by indicator code embedded in the URL.
    if (url.includes('NY.GDP.MKTP.KD.ZG')) {
      return new Response(
        JSON.stringify(
          worldBankPayload('NY.GDP.MKTP.KD.ZG', [
            ['2025', null],
            ['2024', 2.6],
            ['2023', 1.4]
          ])
        ),
        { status: 200 }
      );
    }
    if (url.includes('FR.INR.LEND')) {
      return new Response(JSON.stringify(worldBankPayload('FR.INR.LEND', [['2024', 4.75]])), {
        status: 200
      });
    }
    if (url.includes('FP.CPI.TOTL.ZG')) {
      return new Response(JSON.stringify(worldBankPayload('FP.CPI.TOTL.ZG', [['2024', 2.3]])), {
        status: 200
      });
    }
    // Residential property price index: all-null coverage → no point.
    return new Response(JSON.stringify(worldBankPayload('RPPI', [['2024', null]])), {
      status: 200
    });
  };

  const result = await fetchWorldBankMacro({ countries: ['KR'], fetcher });

  assert.equal(result.provider, 'world-bank-indicators');
  assert.deepEqual(result.countries, ['KR']);
  // One fetch per indicator (4 indicators × 1 country).
  assert.equal(calls, 4);
  // GDP/lending/inflation parse; the all-null RPPI is dropped.
  assert.equal(result.points.length, 3);

  const gdp = findPoint(result.points, 'gdp_growth_pct');
  assert.ok(gdp, 'expected a gdp_growth_pct point');
  assert.equal(gdp.country, 'KR');
  assert.equal(gdp.indicator, 'NY.GDP.MKTP.KD.ZG');
  assert.equal(gdp.value, 2.6); // newest non-null, skipping the 2025 null
  assert.equal(gdp.date, '2024');
  assert.equal(gdp.unit, '%');

  const lending = findPoint(result.points, 'lending_rate_pct');
  assert.ok(lending);
  assert.equal(lending.value, 4.75);

  assert.equal(findPoint(result.points, 'residential_property_price_index'), null);
  assert.equal(result.error, null);

  delete process.env.ENABLE_WORLD_BANK_MACRO;
});

test('world bank adapter fails closed (empty points, no throw) when the fetcher errors', async () => {
  process.env.ENABLE_WORLD_BANK_MACRO = 'true';

  const fetcher = async () => {
    throw new Error('boom: upstream unreachable');
  };

  const result = await fetchWorldBankMacro({
    countries: ['KR'],
    fetcher
  });

  // Never throws into the caller; degrades to an empty point list with a note.
  assert.equal(result.points.length, 0);
  assert.ok(result.error && result.error.includes('boom'), 'error note should be populated');

  delete process.env.ENABLE_WORLD_BANK_MACRO;
});

test('world bank adapter is gated off by default and returns an empty result', async () => {
  delete process.env.ENABLE_WORLD_BANK_MACRO;
  assert.equal(isWorldBankMacroEnabled(), false);

  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    return new Response('[]', { status: 200 });
  };

  const result = await fetchWorldBankMacro({ countries: ['KR'], fetcher });
  assert.equal(calls, 0); // never hits the network when disabled
  assert.equal(result.points.length, 0);
  assert.equal(result.error, 'ENABLE_WORLD_BANK_MACRO not enabled');
});
