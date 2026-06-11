import assert from 'node:assert/strict';
import test from 'node:test';
import type { Fetcher } from '@/lib/sources/http';
import {
  electricityMapsZoneForMarket,
  fetchCarbonIntensity,
  fetchCarbonIntensityForMarket,
  fetchEiaElectricityPrice,
  probeEntsoe
} from '@/lib/sources/adapters/power-grid';

const ORIGINAL_ENV = {
  em: process.env.ELECTRICITYMAPS_API_TOKEN,
  eia: process.env.EIA_API_KEY,
  entsoe: process.env.ENTSOE_API_TOKEN
};

test.afterEach(() => {
  if (ORIGINAL_ENV.em === undefined) delete process.env.ELECTRICITYMAPS_API_TOKEN;
  else process.env.ELECTRICITYMAPS_API_TOKEN = ORIGINAL_ENV.em;
  if (ORIGINAL_ENV.eia === undefined) delete process.env.EIA_API_KEY;
  else process.env.EIA_API_KEY = ORIGINAL_ENV.eia;
  if (ORIGINAL_ENV.entsoe === undefined) delete process.env.ENTSOE_API_TOKEN;
  else process.env.ENTSOE_API_TOKEN = ORIGINAL_ENV.entsoe;
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

test('zone mapping resolves firm market codes to ElectricityMaps zones', () => {
  assert.equal(electricityMapsZoneForMarket('KR'), 'KR');
  assert.equal(electricityMapsZoneForMarket('korea'), 'KR');
  assert.equal(electricityMapsZoneForMarket('CAISO'), 'US-CAL-CISO');
  assert.equal(electricityMapsZoneForMarket('DE'), 'DE');
  assert.equal(electricityMapsZoneForMarket('zz-unknown'), null);
  assert.equal(electricityMapsZoneForMarket(null), null);
});

test('ElectricityMaps: parses carbon intensity + power breakdown', async () => {
  process.env.ELECTRICITYMAPS_API_TOKEN = 'test-token';

  let sawAuthToken = false;
  const fetcher: Fetcher = async (url, init) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    if (headers['auth-token'] === 'test-token') sawAuthToken = true;
    if (url.includes('/carbon-intensity/latest')) {
      return jsonResponse({
        zone: 'KR',
        carbonIntensity: 432,
        datetime: '2026-06-11T09:00:00.000Z'
      });
    }
    if (url.includes('/power-breakdown/latest')) {
      return jsonResponse({
        zone: 'KR',
        fossilFreePercentage: 41.5,
        renewablePercentage: 9.2
      });
    }
    throw new Error(`unexpected url: ${url}`);
  };

  const point = await fetchCarbonIntensity('KR', { fetcher });
  assert.ok(point);
  assert.equal(point.zone, 'KR');
  assert.equal(point.carbonIntensityGco2PerKwh, 432);
  assert.equal(point.fossilFreePct, 41.5);
  assert.equal(point.renewablePct, 9.2);
  assert.equal(point.asOf, '2026-06-11T09:00:00.000Z');
  assert.equal(point.source, 'electricitymaps');
  assert.ok(sawAuthToken, 'auth-token header must be sent');
});

test('ElectricityMaps: carbon point survives a failing breakdown endpoint', async () => {
  process.env.ELECTRICITYMAPS_API_TOKEN = 'test-token';
  const fetcher: Fetcher = async (url) => {
    if (url.includes('/carbon-intensity/latest')) {
      return jsonResponse({ zone: 'DE', carbonIntensity: 210, datetime: '2026-06-11T09:00:00Z' });
    }
    return new Response('boom', { status: 500 });
  };

  const point = await fetchCarbonIntensity('DE', { fetcher });
  assert.ok(point);
  assert.equal(point.carbonIntensityGco2PerKwh, 210);
  assert.equal(point.fossilFreePct, null);
  assert.equal(point.renewablePct, null);
});

test('ElectricityMaps: fail-closed on missing token (no throw, null)', async () => {
  delete process.env.ELECTRICITYMAPS_API_TOKEN;
  const fetcher: Fetcher = async () => {
    throw new Error('should not be called when token is missing');
  };
  assert.equal(await fetchCarbonIntensity('KR', { fetcher }), null);
  assert.equal(await fetchCarbonIntensityForMarket('KR', { fetcher }), null);
});

test('ElectricityMaps: fail-closed on transport error (no throw, null)', async () => {
  process.env.ELECTRICITYMAPS_API_TOKEN = 'test-token';
  const fetcher: Fetcher = async () => {
    throw new Error('network down');
  };
  const point = await fetchCarbonIntensity('KR', { fetcher });
  assert.equal(point, null);
});

test('fetchCarbonIntensityForMarket maps then fetches', async () => {
  process.env.ELECTRICITYMAPS_API_TOKEN = 'test-token';
  const fetcher: Fetcher = async (url) => {
    if (url.includes('zone=US-CAL-CISO') && url.includes('/carbon-intensity/')) {
      return jsonResponse({ zone: 'US-CAL-CISO', carbonIntensity: 180 });
    }
    return jsonResponse({ zone: 'US-CAL-CISO' });
  };
  const point = await fetchCarbonIntensityForMarket('CAISO', { fetcher });
  assert.ok(point);
  assert.equal(point.zone, 'US-CAL-CISO');
  assert.equal(point.carbonIntensityGco2PerKwh, 180);
});

test('EIA: parses retail electricity price', async () => {
  process.env.EIA_API_KEY = 'eia-key';
  let sawApiKey = false;
  const fetcher: Fetcher = async (url) => {
    if (url.includes('api_key=eia-key')) sawApiKey = true;
    return jsonResponse({
      response: {
        data: [{ period: '2026-03', stateid: 'US', sectorid: 'ALL', price: 13.27 }]
      }
    });
  };
  const point = await fetchEiaElectricityPrice('US', { fetcher });
  assert.ok(point);
  assert.equal(point.region, 'US');
  assert.equal(point.retailPriceCentsPerKwh, 13.27);
  assert.equal(point.period, '2026-03');
  assert.equal(point.source, 'eia');
  assert.ok(sawApiKey, 'api_key query param must be sent');
});

test('EIA: fail-closed on missing key (no throw, null)', async () => {
  delete process.env.EIA_API_KEY;
  const fetcher: Fetcher = async () => {
    throw new Error('should not be called');
  };
  assert.equal(await fetchEiaElectricityPrice('US', { fetcher }), null);
});

test('EIA: fail-closed on transport error (no throw, null)', async () => {
  process.env.EIA_API_KEY = 'eia-key';
  const fetcher: Fetcher = async () => {
    throw new Error('timeout');
  };
  assert.equal(await fetchEiaElectricityPrice('US', { fetcher }), null);
});

test('ENTSO-E: reachability scaffold + fail-closed on missing token', async () => {
  delete process.env.ENTSOE_API_TOKEN;
  const noopFetcher: Fetcher = async () => {
    throw new Error('should not be called');
  };
  assert.equal(await probeEntsoe('10Y1001A1001A83F', { fetcher: noopFetcher }), null);

  process.env.ENTSOE_API_TOKEN = 'entsoe-token';
  const xmlFetcher: Fetcher = async () =>
    new Response('<GL_MarketDocument></GL_MarketDocument>', { status: 200 });
  const result = await probeEntsoe('10Y1001A1001A83F', { fetcher: xmlFetcher });
  assert.ok(result);
  assert.equal(result.reachable, true);
  assert.equal(result.source, 'entsoe');

  const errFetcher: Fetcher = async () => {
    throw new Error('auth rejected');
  };
  const failed = await probeEntsoe('10Y1001A1001A83F', { fetcher: errFetcher });
  assert.ok(failed);
  assert.equal(failed.reachable, false);
});
