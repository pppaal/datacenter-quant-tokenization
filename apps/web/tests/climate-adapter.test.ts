import assert from 'node:assert/strict';
import test from 'node:test';
import { createMemorySourceCacheStore } from '@/lib/sources/cache';
import { createClimateAdapter } from '@/lib/sources/adapters/climate';

test('climate adapter uses NASA POWER climatology when no custom overlay endpoint is configured', async () => {
  const store = createMemorySourceCacheStore();
  delete process.env.CLIMATE_OVERLAY_API_URL;
  process.env.NASA_POWER_API_URL = 'https://power.larc.nasa.gov/api/temporal/climatology/point';
  process.env.NASA_POWER_DAILY_API_URL = 'https://power.larc.nasa.gov/api/temporal/daily/point';
  process.env.NASA_POWER_REFERENCE_DATE = '2026-03-20T00:00:00.000Z';
  process.env.NASA_GPM_OPENSEARCH_URL = 'https://gpm.nasa.gov/cgi-bin/api/GeoJSON/timeseries';
  process.env.NASA_FIRMS_API_URL = 'https://firms.modaps.eosdis.nasa.gov/api/area/csv';
  process.env.NASA_FIRMS_MAP_KEY = 'demo-key';

  const adapter = createClimateAdapter(store, async (url) => {
    if (url.includes('/climatology/')) {
      return new Response(
        JSON.stringify({
          properties: {
            parameter: {
              T2M: { ANN: 14.2 },
              PRECTOTCORR: { ANN: 3.45 },
              ALLSKY_SFC_SW_DWN: { ANN: 4.12 }
            }
          }
        }),
        { status: 200 }
      );
    }

    if (url.includes('gpm.nasa.gov') || url.includes('example.com/gpm-subset')) {
      if (url.includes('/GeoJSON/timeseries')) {
        return new Response(
          JSON.stringify({
            items: [
              {
                action: [
                  {
                    type: 'application/geo+json',
                    url: 'https://example.com/gpm-subset?bbox={BBOX}'
                  }
                ]
              }
            ]
          }),
          { status: 200 }
        );
      }

      return new Response(
        JSON.stringify({
          type: 'FeatureCollection',
          features: [
            { properties: { value: 18.4 } },
            { properties: { precip: 26.7 } }
          ]
        }),
        { status: 200 }
      );
    }

    if (url.includes('firms.modaps.eosdis.nasa.gov')) {
      return new Response(
        ['latitude,longitude,frp', '37.55,126.82,4.3', '37.56,126.83,12.8'].join('\n'),
        { status: 200 }
      );
    }

    return new Response(
      JSON.stringify({
        properties: {
          parameter: {
            T2M: {
              '20260317': 16.1,
              '20260318': 17.2,
              '20260319': 18.4
            },
            T2M_MAX: {
              '20260317': 23.1,
              '20260318': 24.8,
              '20260319': 31.2
            },
            PRECTOTCORR: {
              '20260317': 4.2,
              '20260318': 33.6,
              '20260319': 1.1
            }
          }
        }
      }),
      { status: 200 }
    );
  });

  const result = await adapter.fetch({
    assetCode: 'SEOUL-GANGSEO-01',
    latitude: 37.56,
    longitude: 126.82
  });

  assert.equal(result.sourceSystem, 'nasa-power');
  assert.equal(result.mode, 'api');
  assert.match(result.data.climateRiskNote, /NASA POWER climatology indicates average temperature 14.2C/);
  assert.match(result.data.climateRiskNote, /Recent NASA POWER daily NRT shows average temperature 17.2C/);
  assert.match(result.data.climateRiskNote, /GPM IMERG near-real-time precipitation/);
  assert.match(result.data.climateRiskNote, /FIRMS detected 2 recent hotspot/);
  assert.equal(result.data.heavyRainDays, 1);
  assert.equal(result.data.hotDaysCount, 1);
  assert.equal(result.data.recentSatellitePrecipMm, 26.7);
  assert.equal(result.data.recentFireHotspots, 2);
  assert.equal(result.data.recentMaxFireRadiativePowerMw, 12.8);
  assert.ok((result.data.floodRiskScore ?? 0) > 1);
  assert.ok((result.data.wildfireRiskScore ?? 0) > 1);

  const now = new Date();
  const gpmCache = await store.getFreshCache<{ recentSatellitePrecipMm: number | null }>(
    'nasa-gpm-imerg',
    'SEOUL-GANGSEO-01',
    now
  );
  const firmsCache = await store.getFreshCache<{ recentFireHotspots: number | null }>(
    'nasa-firms',
    'SEOUL-GANGSEO-01',
    now
  );

  assert.equal(gpmCache?.status, 'FRESH');
  assert.equal(gpmCache?.payload.recentSatellitePrecipMm, 26.7);
  assert.equal(firmsCache?.status, 'FRESH');
  assert.equal(firmsCache?.payload.recentFireHotspots, 2);
});
