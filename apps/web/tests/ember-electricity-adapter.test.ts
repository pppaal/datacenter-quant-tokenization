import assert from 'node:assert/strict';
import test from 'node:test';
import type { Fetcher } from '@/lib/sources/http';
import {
  fetchEmberElectricity,
  isEmberConfigured,
  getConfiguredPowerGridProviders
} from '@/lib/sources/adapters/power-grid';

const ORIGINAL_ENV = {
  key: process.env.EMBER_API_KEY,
  base: process.env.EMBER_API_BASE
};

test.afterEach(() => {
  if (ORIGINAL_ENV.key === undefined) delete process.env.EMBER_API_KEY;
  else process.env.EMBER_API_KEY = ORIGINAL_ENV.key;
  if (ORIGINAL_ENV.base === undefined) delete process.env.EMBER_API_BASE;
  else process.env.EMBER_API_BASE = ORIGINAL_ENV.base;
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

// A representative Ember "yearly" payload: one row per (series, year). The
// adapter must pick the latest year per series and map labels to typed fields.
const SAMPLE = {
  data: [
    { entity_code: 'KOR', date: '2023', series: 'Total Generation', value: 588.3, unit: 'TWh' },
    { entity_code: 'KOR', date: '2024', series: 'Total Generation', value: 601.9, unit: 'TWh' },
    { entity_code: 'KOR', date: '2024', series: 'CO2 intensity', value: 436.1, unit: 'gCO2/kWh' },
    { entity_code: 'KOR', date: '2024', series: 'Renewables', value: 9.8, unit: '%' },
    { entity_code: 'KOR', date: '2024', series: 'Clean', value: 40.2, unit: '%' }
  ]
};

test('Ember: parses latest-year generation mix from a sample payload', async () => {
  process.env.EMBER_API_KEY = 'ember-key';
  let sawKeyAndEntity = false;
  const fetcher: Fetcher = async (url) => {
    if (url.includes('api_key=ember-key') && url.includes('entity_code=KOR')) {
      sawKeyAndEntity = true;
    }
    assert.ok(url.includes('/electricity-generation/yearly'), 'hits the yearly endpoint');
    return jsonResponse(SAMPLE);
  };

  const point = await fetchEmberElectricity('kor', { fetcher });
  assert.ok(point);
  assert.equal(point.entity, 'KOR');
  assert.equal(point.year, 2024);
  // Latest year (2024) generation, not the 2023 row.
  assert.equal(point.generationTwh, 601.9);
  assert.equal(point.emissionsIntensityGco2PerKwh, 436.1);
  assert.equal(point.renewablePct, 9.8);
  assert.equal(point.fossilFreePct, 40.2);
  assert.equal(point.source, 'ember');
  assert.ok(sawKeyAndEntity, 'api_key + entity_code query params must be sent');
});

test('Ember: respects EMBER_API_BASE override', async () => {
  process.env.EMBER_API_KEY = 'ember-key';
  process.env.EMBER_API_BASE = 'https://ember.internal/v1';
  let sawBase = false;
  const fetcher: Fetcher = async (url) => {
    if (url.startsWith('https://ember.internal/v1/')) sawBase = true;
    return jsonResponse(SAMPLE);
  };
  const point = await fetchEmberElectricity('KOR', { fetcher });
  assert.ok(point);
  assert.ok(sawBase, 'base URL override must be honored');
});

test('Ember: isConfigured + provider list reflect the key', () => {
  process.env.EMBER_API_KEY = 'ember-key';
  assert.equal(isEmberConfigured(), true);
  assert.ok(getConfiguredPowerGridProviders().includes('ember'));

  delete process.env.EMBER_API_KEY;
  assert.equal(isEmberConfigured(), false);
  assert.ok(!getConfiguredPowerGridProviders().includes('ember'));
});

test('Ember: fail-closed on missing key (no throw, null)', async () => {
  delete process.env.EMBER_API_KEY;
  const fetcher: Fetcher = async () => {
    throw new Error('should not be called when key is missing');
  };
  assert.equal(await fetchEmberElectricity('KOR', { fetcher }), null);
});

test('Ember: fail-closed on blank entity code (no throw, null)', async () => {
  process.env.EMBER_API_KEY = 'ember-key';
  const fetcher: Fetcher = async () => {
    throw new Error('should not be called for a blank entity');
  };
  assert.equal(await fetchEmberElectricity('   ', { fetcher }), null);
});

test('Ember: fail-closed on transport error (no throw, null)', async () => {
  process.env.EMBER_API_KEY = 'ember-key';
  const fetcher: Fetcher = async () => {
    throw new Error('network down');
  };
  assert.equal(await fetchEmberElectricity('KOR', { fetcher }), null);
});

test('Ember: fail-closed on empty data array (no throw, null)', async () => {
  process.env.EMBER_API_KEY = 'ember-key';
  const fetcher: Fetcher = async () => jsonResponse({ data: [] });
  assert.equal(await fetchEmberElectricity('KOR', { fetcher }), null);
});
