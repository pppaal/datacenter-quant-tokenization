import assert from 'node:assert/strict';
import test from 'node:test';
import { createMemorySourceCacheStore } from '@/lib/sources/cache';
import { createFxAdapter } from '@/lib/sources/adapters/fx';
import { createGeospatialAdapter } from '@/lib/sources/adapters/geospatial';
import { createMacroAdapter } from '@/lib/sources/adapters/macro';
import { createMarketAdapter } from '@/lib/sources/adapters/market';
import { AssetClass } from '@prisma/client';

test('source adapter caches API responses and serves the cached copy on subsequent requests', async () => {
  const store = createMemorySourceCacheStore();
  let calls = 0;

  process.env.KOREA_GEOSPATIAL_API_URL = 'https://geo.example.com';
  process.env.KOREA_GEOSPATIAL_API_KEY = 'test-key';

  const adapter = createGeospatialAdapter(store, async () => {
    calls += 1;
    return new Response(
      JSON.stringify({
        latitude: 37.55,
        longitude: 126.82,
        parcelId: 'parcel-1',
        gridAvailability: 'Direct feed',
        fiberAccess: 'Dual carrier',
        latencyProfile: 'Metro core',
        floodRiskScore: 1.5,
        seismicRiskScore: 1.1
      }),
      { status: 200 }
    );
  });

  const first = await adapter.fetch({
    assetCode: 'SEOUL-GANGSEO-01',
    address: '148 Gonghang-daero',
    city: 'Seoul',
    province: 'Seoul'
  });

  const second = await adapter.fetch({
    assetCode: 'SEOUL-GANGSEO-01',
    address: '148 Gonghang-daero',
    city: 'Seoul',
    province: 'Seoul'
  });

  assert.equal(first.mode, 'api');
  assert.equal(second.mode, 'cache');
  assert.equal(calls, 1);
  assert.equal(second.data.parcelId, 'parcel-1');
});

test('fx adapter caches live FX responses and reuses the cached rate', async () => {
  const store = createMemorySourceCacheStore();
  let calls = 0;

  process.env.GLOBAL_FX_API_URL = 'https://fx.example.com/latest';
  process.env.GLOBAL_FX_API_KEY = 'fx-key';

  const adapter = createFxAdapter(store, async () => {
    calls += 1;
    return new Response(
      JSON.stringify({
        base: 'USD',
        date: '2026-03-24',
        rates: {
          KRW: 1382.45
        }
      }),
      { status: 200 }
    );
  });

  const first = await adapter.fetch('USD');
  const second = await adapter.fetch('USD');

  assert.equal(first.mode, 'api');
  assert.equal(second.mode, 'cache');
  assert.equal(calls, 1);
  assert.equal(first.data.rateToKrw, 1382.45);
  assert.equal(second.data.rateToKrw, 1382.45);

  delete process.env.GLOBAL_FX_API_URL;
  delete process.env.GLOBAL_FX_API_KEY;
});

test('macro adapter can fetch US FRED series and map them into macro inputs', async () => {
  const store = createMemorySourceCacheStore();

  process.env.US_FRED_API_KEY = 'fred-key';
  process.env.US_FRED_POLICY_RATE_SERIES_ID = 'FEDFUNDS';
  process.env.US_FRED_INFLATION_SERIES_ID = 'CPIAUCSL';
  process.env.US_FRED_CREDIT_SPREAD_SERIES_ID = 'BAMLC0A0CM';

  const adapter = createMacroAdapter(store, async (input) => {
    const url = new URL(String(input));
    const seriesId = url.searchParams.get('series_id');

    const values: Record<string, string> = {
      FEDFUNDS: '5.33',
      CPIAUCSL: '3.10',
      BAMLC0A0CM: '168'
    };

    return new Response(
      JSON.stringify({
        observations: [
          {
            date: '2026-02-01',
            value: values[seriesId ?? ''] ?? '.'
          }
        ]
      }),
      { status: 200 }
    );
  });

  const result = await adapter.fetch({
    assetCode: 'US-NYC-01',
    market: 'US',
    country: 'US'
  });

  assert.equal(result.sourceSystem, 'us-fred');
  assert.equal(result.mode, 'api');
  assert.equal(result.data.policyRatePct, 5.33);
  assert.equal(result.data.inflationPct, 3.1);
  assert.equal(result.data.creditSpreadBps, 168);
  assert.equal(result.data.metroRegion, 'United States benchmark');

  delete process.env.US_FRED_API_KEY;
  delete process.env.US_FRED_POLICY_RATE_SERIES_ID;
  delete process.env.US_FRED_INFLATION_SERIES_ID;
  delete process.env.US_FRED_CREDIT_SPREAD_SERIES_ID;
});

test('macro adapter can supplement US macro inputs with BLS and Treasury series', async () => {
  const store = createMemorySourceCacheStore();

  process.env.US_BLS_INFLATION_SERIES_ID = 'CUUR0000SA0';
  process.env.US_TREASURY_DEBT_COST_ENDPOINT = '/v2/accounting/od/example/debt_cost';
  process.env.US_TREASURY_DEBT_COST_FIELD = 'avg_rate';
  process.env.US_TREASURY_DISCOUNT_RATE_ENDPOINT = '/v2/accounting/od/example/discount_rate';
  process.env.US_TREASURY_DISCOUNT_RATE_FIELD = 'yield_pct';

  const adapter = createMacroAdapter(store, async (input, init) => {
    const url = String(input);

    if (init?.method === 'POST' && url.includes('bls.gov')) {
      return new Response(
        JSON.stringify({
          Results: {
            series: [
              {
                seriesID: 'CUUR0000SA0',
                data: [
                  {
                    year: '2026',
                    period: 'M02',
                    value: '3.40'
                  }
                ]
              }
            ]
          }
        }),
        { status: 200 }
      );
    }

    if (url.includes('debt_cost')) {
      return new Response(
        JSON.stringify({
          data: [
            {
              record_date: '2026-03-20',
              avg_rate: '5.95'
            }
          ]
        }),
        { status: 200 }
      );
    }

    if (url.includes('discount_rate')) {
      return new Response(
        JSON.stringify({
          data: [
            {
              record_date: '2026-03-20',
              yield_pct: '6.85'
            }
          ]
        }),
        { status: 200 }
      );
    }

    throw new Error(`unexpected request ${url}`);
  });

  const result = await adapter.fetch({
    assetCode: 'US-CHI-01',
    market: 'US',
    country: 'US'
  });

  assert.equal(result.sourceSystem, 'us-public-macro-stack');
  assert.equal(result.data.inflationPct, 3.4);
  assert.equal(result.data.debtCostPct, 5.95);
  assert.equal(result.data.discountRatePct, 6.85);
  assert.match(result.data.marketNotes, /BLS inflation series/i);
  assert.match(result.data.marketNotes, /Treasury debt-cost proxy series/i);

  delete process.env.US_BLS_INFLATION_SERIES_ID;
  delete process.env.US_TREASURY_DEBT_COST_ENDPOINT;
  delete process.env.US_TREASURY_DEBT_COST_FIELD;
  delete process.env.US_TREASURY_DISCOUNT_RATE_ENDPOINT;
  delete process.env.US_TREASURY_DISCOUNT_RATE_FIELD;
});

test('macro adapter can fetch euro-area ECB series and map them into macro inputs', async () => {
  const store = createMemorySourceCacheStore();

  process.env.ECB_INFLATION_FLOW_REF = 'ICP';
  process.env.ECB_INFLATION_KEY = 'M.U2.N.000000.4.ANR';
  process.env.ECB_POLICY_RATE_FLOW_REF = 'FM';
  process.env.ECB_POLICY_RATE_KEY = 'B.U2.EUR.4F.KR.MRR_FR.LEV';
  process.env.ECB_CREDIT_SPREAD_FLOW_REF = 'FM';
  process.env.ECB_CREDIT_SPREAD_KEY = 'B.U2.EUR.4F.BB.U2_10Y';

  const adapter = createMacroAdapter(store, async (input) => {
    const url = String(input);

    if (url.includes('/ICP/')) {
      return new Response('TIME_PERIOD,OBS_VALUE\n2026-02,2.5\n', { status: 200 });
    }

    if (url.includes('/FM/') && url.includes('MRR_FR')) {
      return new Response('TIME_PERIOD,OBS_VALUE\n2026-03-18,4.0\n', { status: 200 });
    }

    return new Response('TIME_PERIOD,OBS_VALUE\n2026-03-18,145\n', { status: 200 });
  });

  const result = await adapter.fetch({
    assetCode: 'DE-BER-01',
    market: 'DE',
    country: 'DE'
  });

  assert.equal(result.sourceSystem, 'ecb-data-api');
  assert.equal(result.data.inflationPct, 2.5);
  assert.equal(result.data.policyRatePct, 4);
  assert.equal(result.data.creditSpreadBps, 145);
  assert.match(result.data.marketNotes, /ECB inflation series/i);

  delete process.env.ECB_INFLATION_FLOW_REF;
  delete process.env.ECB_INFLATION_KEY;
  delete process.env.ECB_POLICY_RATE_FLOW_REF;
  delete process.env.ECB_POLICY_RATE_KEY;
  delete process.env.ECB_CREDIT_SPREAD_FLOW_REF;
  delete process.env.ECB_CREDIT_SPREAD_KEY;
});

test('market adapter caches market comps and indicator payloads', async () => {
  const store = createMemorySourceCacheStore();
  let calls = 0;

  process.env.GLOBAL_MARKET_API_URL = 'https://market.example.com/feed';
  process.env.GLOBAL_MARKET_API_KEY = 'market-key';

  const adapter = createMarketAdapter(store, async () => {
    calls += 1;
    return new Response(
      JSON.stringify({
        metroRegion: 'New York',
        vacancyPct: 9.2,
        capRatePct: 5.7,
        rentGrowthPct: 1.9,
        transactionVolumeIndex: 93,
        marketNotes: 'US office liquidity remains selective.',
        comparableSetName: 'New York office market comps',
        transactionComps: [
          {
            label: 'Park Avenue Tower',
            region: 'New York Midtown',
            comparableType: 'OFFICE',
            transactionDate: '2026-02-01',
            priceKrw: 185000000000,
            grossFloorAreaSqm: 42000,
            capRatePct: 5.6
          }
        ],
        rentComps: [
          {
            region: 'New York Midtown',
            comparableType: 'OFFICE',
            observationDate: '2026-02-01',
            monthlyRentPerSqmKrw: 88000,
            occupancyPct: 91
          }
        ],
        indicators: [
          {
            indicatorKey: 'office_absorption',
            value: 12.4,
            unit: 'msf',
            observationDate: '2026-02-01',
            region: 'New York Midtown'
          }
        ]
      }),
      { status: 200 }
    );
  });

  const first = await adapter.fetch({
    assetCode: 'US-NYC-OFFICE-01',
    assetClass: AssetClass.OFFICE,
    market: 'US',
    country: 'US'
  });
  const second = await adapter.fetch({
    assetCode: 'US-NYC-OFFICE-01',
    assetClass: AssetClass.OFFICE,
    market: 'US',
    country: 'US'
  });

  assert.equal(first.mode, 'api');
  assert.equal(second.mode, 'cache');
  assert.equal(calls, 1);
  assert.equal(first.data.transactionComps.length, 1);
  assert.equal(first.data.rentComps.length, 1);
  assert.equal(first.data.indicators.length, 1);

  delete process.env.GLOBAL_MARKET_API_URL;
  delete process.env.GLOBAL_MARKET_API_KEY;
});
