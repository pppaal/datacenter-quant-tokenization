/**
 * Data smoke test — verifies every public-data connector end-to-end.
 *
 * Run with:  npm --prefix apps/web run data:smoke
 *
 * For each connector it prints one of:
 *   LIVE ✅  — a real API key/flag is set AND the call returned real data
 *   LIVE ∅   — live mode is on but the call returned empty (key set but no
 *              rows for the fixture, or upstream had nothing — not an error)
 *   MOCK     — no key/flag set, so the deterministic mock is in use (expected
 *              until you add keys; the product still runs)
 *   ERROR    — the call threw or the upstream returned an error string
 *
 * It uses a fixed Seoul fixture (Apgujeong, Gangnam) so the same row is
 * checked every time:
 *   coords  37.527, 127.028
 *   PNU     1168010600104580007  (서울 강남구 압구정동 458-7)
 *   LAWD    11680  (강남구 시군구 코드)
 *
 * The script never mutates anything and is safe to run against production env.
 * It makes real outbound calls only for connectors whose key/flag is set.
 */

import { resolveConnectorMode, getConnectorBundle } from '@/lib/services/public-data/registry';
import type { ConnectorKind } from '@/lib/services/public-data/registry';
import { fetchInterconnectionSignal } from '@/lib/services/dc-intel/peeringdb';
import { fetchAirQuality } from '@/lib/services/dc-intel/openaq';
import { fetchSiteHazards } from '@/lib/services/dc-intel/thinkhazard';
import { fetchPoiDensity } from '@/lib/services/dc-intel/overpass-poi';
import { fetchAllMacroData, getConfiguredProviders } from '@/lib/services/macro/data-providers';
import { isKakaoConfigured, kakaoGeocodeAddress } from '@/lib/services/geocode/kakao-geocode';
import { isOsmGeocoderEnabled, osmGeocodeAddress } from '@/lib/services/geocode/osm-geocode';
import { createFxAdapter } from '@/lib/sources/adapters/fx';
import { createClimateAdapter } from '@/lib/sources/adapters/climate';
import type { SourceCacheStore } from '@/lib/sources/types';
import type { ParcelIdentifier, LatLng } from '@/lib/services/public-data/types';

// These two adapters are keyless (Frankfurter FX, NASA POWER climate) but are
// built on the DB-backed SourceCacheStore. A no-op in-memory store lets the
// smoke exercise them with zero DB — every call misses the cache and goes live.
const memStore: SourceCacheStore = {
  async getOverride() {
    return null;
  },
  async getFreshCache() {
    return null;
  },
  async upsertCache() {}
};

// ---------------------------------------------------------------------------
// Fixture — a single, real Seoul parcel so every run checks the same row.
// ---------------------------------------------------------------------------
const COORDS: LatLng = { latitude: 37.527, longitude: 127.028 };
const PARCEL: ParcelIdentifier = {
  jibunAddress: '서울특별시 강남구 압구정동 458-7',
  pnu: '1168010600104580007',
  roadAddress: '서울특별시 강남구 압구정로 340'
};
const LAWD_CODE = '11680'; // 강남구
const DISTRICT = '강남구';
const METRO = '서울 강남권';
const ADDRESS = '서울특별시 강남구 압구정로 340';

type Status = 'LIVE ✅' | 'LIVE ∅' | 'MOCK' | 'OFF' | 'ERROR';

type Row = {
  group: string;
  name: string;
  status: Status;
  detail: string;
};

const rows: Row[] = [];

function record(group: string, name: string, status: Status, detail: string) {
  rows.push({ group, name, status, detail });
}

/**
 * Run one connector probe. `mode` says whether a key/flag enables live mode.
 * `nonEmpty(value)` decides whether the live result actually carried data.
 */
async function probe<T>(
  group: string,
  name: string,
  enabled: boolean,
  disabledStatus: Status,
  call: () => Promise<T>,
  describe: (value: T) => { nonEmpty: boolean; detail: string }
): Promise<void> {
  if (!enabled) {
    record(
      group,
      name,
      disabledStatus,
      disabledStatus === 'MOCK' ? 'no key — mock data' : 'not configured'
    );
    return;
  }
  try {
    const value = await call();
    const { nonEmpty, detail } = describe(value);
    record(group, name, nonEmpty ? 'LIVE ✅' : 'LIVE ∅', detail);
  } catch (err) {
    record(group, name, 'ERROR', err instanceof Error ? err.message : String(err));
  }
}

async function run(): Promise<void> {
  // -------------------------------------------------------------------------
  // 1. Korea public-data registry (key-gated: live vs mock)
  // -------------------------------------------------------------------------
  const mode = resolveConnectorMode();
  const bundle = getConnectorBundle();
  const live = (k: ConnectorKind) => mode[k] === 'live';

  await probe(
    'Korea',
    'building-registry (건축물대장 / MOLIT)',
    live('buildingRegistry'),
    'MOCK',
    () => bundle.buildingRegistry.fetch(PARCEL),
    (b) => ({ nonEmpty: b != null, detail: b ? `use=${b.mainUse}` : 'null' })
  );
  await probe(
    'Korea',
    'use-zone (토지이용계획 / V-World)',
    live('useZone'),
    'MOCK',
    () => bundle.useZone.fetch(PARCEL),
    (z) => ({ nonEmpty: z != null, detail: z ? JSON.stringify(z).slice(0, 60) : 'null' })
  );
  await probe(
    'Korea',
    'land-pricing (개별공시지가 / V-World)',
    live('landPricing'),
    'MOCK',
    () => bundle.landPricing.fetch(PARCEL),
    (p) => ({ nonEmpty: p != null, detail: p ? JSON.stringify(p).slice(0, 60) : 'null' })
  );
  await probe(
    'Korea',
    'rent-comps (임대동향 / R-ONE)',
    live('rentComps'),
    'MOCK',
    () => bundle.rentComps.fetch(COORDS, 'OFFICE', 2),
    (r) => ({ nonEmpty: r.length > 0, detail: `${r.length} comps` })
  );
  await probe(
    'Korea',
    'grid-access (변전소 / KEPCO)',
    live('grid'),
    'MOCK',
    () => bundle.grid.fetch(PARCEL, COORDS),
    (g) => ({ nonEmpty: g != null, detail: g ? `substation=${g.nearestSubstationName}` : 'null' })
  );
  await probe(
    'Korea',
    'macro-micro (KOSIS 통계청)',
    live('macroMicro'),
    'MOCK',
    () => bundle.macroMicro.fetch(DISTRICT, METRO),
    (m) => ({ nonEmpty: !!m.notes, detail: m.notes.slice(0, 60) })
  );
  await probe(
    'Korea',
    'transaction-comps (실거래가 / RTMS)',
    live('transactionComps'),
    'MOCK',
    () => {
      const now = new Date();
      const yyyymm = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
      const from = new Date(now.getFullYear(), now.getMonth() - 3, 1);
      return bundle.transactionComps.fetch({
        lawdCode: LAWD_CODE,
        fromYyyyMm: yyyymm(from),
        toYyyyMm: yyyymm(now)
      });
    },
    (t) => ({ nonEmpty: t.length > 0, detail: `${t.length} deals` })
  );

  // -------------------------------------------------------------------------
  // 2. DC / site-intel connectors (keyless, ENABLE_* flag-gated)
  // -------------------------------------------------------------------------
  await probe(
    'DC-intel',
    'PeeringDB interconnection (ENABLE_PEERINGDB)',
    isFlag('ENABLE_PEERINGDB'),
    'OFF',
    () => fetchInterconnectionSignal({ ...COORDS, country: 'KR' }),
    (r) => ({
      nonEmpty: r.facilityCount > 0,
      detail: `${r.facilityCount} facilities, score=${r.interconnectionScore}`
    })
  );
  await probe(
    'DC-intel',
    'OpenAQ air quality (OPENAQ_API_KEY)',
    !!process.env.OPENAQ_API_KEY?.trim(),
    'OFF',
    () => fetchAirQuality(COORDS),
    (r) => ({
      nonEmpty: r.stationCount > 0,
      detail: `${r.stationCount} stations, pm25=${r.pm25 ?? 'n/a'}`
    })
  );
  await probe(
    'DC-intel',
    'ThinkHazard site risk (ENABLE_THINKHAZARD)',
    isFlag('ENABLE_THINKHAZARD'),
    'OFF',
    () => fetchSiteHazards(COORDS),
    (r) => ({
      nonEmpty: r.hazards.length > 0,
      // Public API has no coordinate lookup; needs an adminId (division code),
      // so a coordinate-only probe is expected to come back empty.
      detail:
        r.hazards.length > 0
          ? `${r.hazards.length} hazards, risk=${r.overallRiskScore}`
          : 'empty — needs adminId (no coord lookup in public API)'
    })
  );
  await probe(
    'DC-intel',
    'Overpass POI density (ENABLE_OVERPASS_POI)',
    isFlag('ENABLE_OVERPASS_POI'),
    'OFF',
    () => fetchPoiDensity(COORDS),
    (r) => ({ nonEmpty: r.totalPoi > 0, detail: `${r.totalPoi} POIs, amenity=${r.amenityScore}` })
  );

  // -------------------------------------------------------------------------
  // 3. Geocoder
  // -------------------------------------------------------------------------
  // Probe the real provider directly (Kakao or OSM) — NOT geocodeAddress, which
  // silently falls back to the demo mock when the live provider is unreachable
  // and would falsely report LIVE.
  const geocoderName = isKakaoConfigured() ? 'geocoder (Kakao)' : 'geocoder (OSM Nominatim)';
  await probe(
    'Geo',
    geocoderName,
    isKakaoConfigured() || isOsmGeocoderEnabled(),
    'MOCK',
    () => (isKakaoConfigured() ? kakaoGeocodeAddress(ADDRESS) : osmGeocodeAddress(ADDRESS)),
    (g) =>
      g
        ? {
            nonEmpty: true,
            detail: `${g.location.latitude.toFixed(4)}, ${g.location.longitude.toFixed(4)}`
          }
        : { nonEmpty: false, detail: 'no result (provider unreachable or not found)' }
  );

  // -------------------------------------------------------------------------
  // 4. Keyless market/climate adapters (no key, no flag — always probed)
  // -------------------------------------------------------------------------
  await probe(
    'Market',
    'FX rates (Frankfurter, keyless)',
    true,
    'OFF',
    () => createFxAdapter(memStore).fetch('USD'),
    (env) => ({
      // Live success → provider 'frankfurter' + FRESH; failure falls back to a
      // default rate with status FAILED (no throw).
      nonEmpty: env.status === 'FRESH' && env.data.provider === 'frankfurter',
      detail: `USD→KRW ${env.data.rateToKrw} (${env.data.provider}, ${env.status})`
    })
  );
  await probe(
    'Climate',
    'NASA POWER climate (keyless)',
    true,
    'OFF',
    () =>
      createClimateAdapter(memStore).fetch({
        assetCode: 'SMOKE-APGUJEONG',
        latitude: COORDS.latitude,
        longitude: COORDS.longitude
      }),
    (env) => ({
      nonEmpty: env.status === 'FRESH',
      detail:
        env.data.recentAverageTempC != null
          ? `avgTemp=${env.data.recentAverageTempC}°C, ${env.sourceSystem} (${env.status})`
          : `${env.data.climateRiskNote} (${env.status})`
    })
  );

  // -------------------------------------------------------------------------
  // 5. Global macro providers (Promise.allSettled inside fetchAllMacroData)
  // -------------------------------------------------------------------------
  const configured = getConfiguredProviders();
  if (configured.length === 0) {
    record('Macro', 'all providers', 'OFF', 'no macro key/flag set');
  } else {
    try {
      const results = await fetchAllMacroData(12);
      const byProvider = new Map(results.map((r) => [r.provider, r]));
      for (const provider of configured) {
        const result = byProvider.get(provider);
        if (!result) {
          record('Macro', provider, 'LIVE ∅', 'configured but returned no result');
        } else if (result.error) {
          record('Macro', provider, 'ERROR', result.error);
        } else {
          record(
            'Macro',
            provider,
            result.points.length > 0 ? 'LIVE ✅' : 'LIVE ∅',
            `${result.points.length} series points`
          );
        }
      }
    } catch (err) {
      record(
        'Macro',
        'fetchAllMacroData',
        'ERROR',
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  printTable();
  printSummary();
}

function isFlag(name: string): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

function printTable(): void {
  const groupW = Math.max(8, ...rows.map((r) => r.group.length));
  const nameW = Math.max(8, ...rows.map((r) => r.name.length));
  const statusW = 8;
  console.log('');
  console.log(
    `${pad('SOURCE', groupW)}  ${pad('CONNECTOR', nameW)}  ${pad('STATUS', statusW)}  DETAIL`
  );
  console.log('-'.repeat(groupW + nameW + statusW + 12));
  let lastGroup = '';
  for (const r of rows) {
    const group = r.group === lastGroup ? '' : r.group;
    lastGroup = r.group;
    console.log(
      `${pad(group, groupW)}  ${pad(r.name, nameW)}  ${pad(r.status, statusW)}  ${truncate(r.detail, 80)}`
    );
  }
}

function printSummary(): void {
  const counts = rows.reduce<Record<string, number>>((acc, r) => {
    const key = r.status.startsWith('LIVE') ? 'live' : r.status.toLowerCase();
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const live = rows.filter((r) => r.status === 'LIVE ✅').length;
  const total = rows.length;
  console.log('');
  console.log(
    `Summary: ${live}/${total} returning LIVE data` +
      `  (live∅=${rows.filter((r) => r.status === 'LIVE ∅').length},` +
      ` mock=${counts.mock ?? 0}, off=${counts.off ?? 0}, error=${counts.error ?? 0})`
  );
  if (live === 0) {
    console.log('No live data yet — see apps/web/docs/DATA_KEYS.md to add keys, then re-run.');
  }
  const errored = rows.filter((r) => r.status === 'ERROR');
  if (errored.length > 0) {
    console.log(
      `\n${errored.length} connector(s) errored — they are configured but the call failed:`
    );
    for (const e of errored) {
      console.log(`  - ${e.group}/${e.name}: ${truncate(e.detail, 160)}`);
    }
    process.exitCode = 1;
  }
}

function pad(value: string, width: number): string {
  return value.length >= width ? value : value + ' '.repeat(width - value.length);
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

run().catch((err) => {
  console.error('[data:smoke] fatal:', err);
  process.exit(1);
});
