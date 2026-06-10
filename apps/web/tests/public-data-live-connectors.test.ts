import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { resolveConnectorMode, getConnectorBundle } from '@/lib/services/public-data/registry';
import { LiveReoneRentComps, resolveReoneRegion } from '@/lib/services/public-data/live/rone-rent';
import { LiveVworldLandPricing } from '@/lib/services/public-data/live/vworld-land-price';
import {
  LiveVworldUseZone,
  mapZoneLabelToCode
} from '@/lib/services/public-data/live/vworld-use-zone';
import { LiveKosisMacroMicro } from '@/lib/services/public-data/live/kosis-macro';
import type { ParcelIdentifier } from '@/lib/services/public-data/types';

const PARCEL: ParcelIdentifier = {
  jibunAddress: '서울특별시 강남구 압구정동 458-7',
  pnu: '1168010600104580007',
  roadAddress: '서울특별시 강남구 압구정로 340'
};

const CONNECTOR_KEYS = [
  'VWORLD_API_KEY',
  'RONE_API_KEY',
  'KOSIS_API_KEY',
  'MOLIT_BUILDING_API_KEY',
  'RTMS_SERVICE_KEY',
  'KEPCO_SUBSTATION_DATA_PATH',
  'KEPCO_SUBSTATION_DATA_URL'
] as const;

const saved = new Map<string, string | undefined>();
function clearKeys() {
  for (const k of CONNECTOR_KEYS) {
    saved.set(k, process.env[k]);
    delete process.env[k];
  }
}
afterEach(() => {
  for (const [k, v] of saved) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  saved.clear();
});

test('resolveReoneRegion maps Apgujeong to the Gangnam submarket', () => {
  // Apgujeong-ro ~ (37.527, 127.028)
  assert.equal(resolveReoneRegion({ latitude: 37.527, longitude: 127.028 }).regionCode, 'GANGNAM');
  assert.equal(resolveReoneRegion({ latitude: 37.566, longitude: 126.978 }).regionCode, 'CBD');
  assert.equal(resolveReoneRegion({ latitude: 37.525, longitude: 126.925 }).regionCode, 'YBD');
});

test('mapZoneLabelToCode classifies Korean zoning labels', () => {
  assert.equal(mapZoneLabelToCode('제3종일반주거지역'), 'RESIDENTIAL_3');
  assert.equal(mapZoneLabelToCode('일반상업지역'), 'COMMERCIAL_GENERAL');
  assert.equal(mapZoneLabelToCode('중심상업지역'), 'COMMERCIAL_CENTRAL');
  assert.equal(mapZoneLabelToCode('준공업지역'), 'INDUSTRIAL_QUASI');
  assert.equal(mapZoneLabelToCode('자연녹지지역'), 'GREEN_NATURAL');
  assert.equal(mapZoneLabelToCode(''), 'UNKNOWN');
  assert.equal(mapZoneLabelToCode(null), 'UNKNOWN');
});

test('live adapters fail closed to mock-compatible empties when unconfigured', async () => {
  // No API key → no network call, safe empty/null so the registry mock path holds.
  assert.deepEqual(
    await new LiveReoneRentComps(undefined).fetch({ latitude: 37.5, longitude: 127.0 }, 'OFFICE', 2),
    []
  );
  assert.equal(await new LiveVworldLandPricing(undefined).fetch(PARCEL), null);
  assert.equal(await new LiveVworldUseZone(undefined).fetch(PARCEL), null);
});

test('KOSIS macro adapter always returns a snapshot (delegates to mock without a key)', async () => {
  const snap = await new LiveKosisMacroMicro(undefined).fetch('강남구', '서울 강남권');
  assert.equal(snap.district, '강남구');
  assert.equal(typeof snap.notes, 'string');
});

test('registry flips each connector to live only when its key is present', () => {
  clearKeys();
  const allMock = resolveConnectorMode();
  assert.equal(allMock.rentComps, 'mock');
  assert.equal(allMock.useZone, 'mock');
  assert.equal(allMock.landPricing, 'mock');
  assert.equal(allMock.macroMicro, 'mock');

  process.env.RONE_API_KEY = 'k';
  process.env.VWORLD_API_KEY = 'k';
  process.env.KOSIS_API_KEY = 'k';
  const live = resolveConnectorMode();
  assert.equal(live.rentComps, 'live');
  assert.equal(live.useZone, 'live'); // V-World powers both use-zone and land-pricing
  assert.equal(live.landPricing, 'live');
  assert.equal(live.macroMicro, 'live');

  // getConnectorBundle wires the live classes without throwing.
  const bundle = getConnectorBundle();
  assert.equal(bundle.rentComps instanceof LiveReoneRentComps, true);
  assert.equal(bundle.useZone instanceof LiveVworldUseZone, true);
  assert.equal(bundle.landPricing instanceof LiveVworldLandPricing, true);
  assert.equal(bundle.macroMicro instanceof LiveKosisMacroMicro, true);
});
