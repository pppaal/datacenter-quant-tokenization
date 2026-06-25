import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { AssetClass } from '@prisma/client';
import { resolveConnectorMode, getConnectorBundle } from '@/lib/services/public-data/registry';
import { buildAnalysisProvenance } from '@/lib/services/property-analyzer/bundle-assembler';
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
  // Apgujeong-ro ~ (37.527, 127.028). resolveReoneRegion now returns the R-ONE
  // 권역 CLS_NM (Korean submarket name) rather than an internal code.
  assert.equal(resolveReoneRegion({ latitude: 37.527, longitude: 127.028 }).clsNm, '강남');
  assert.equal(resolveReoneRegion({ latitude: 37.566, longitude: 126.978 }).clsNm, '도심');
  assert.equal(resolveReoneRegion({ latitude: 37.525, longitude: 126.925 }).clsNm, '여의도');
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
    await new LiveReoneRentComps(undefined).fetch(
      { latitude: 37.5, longitude: 127.0 },
      'OFFICE',
      2
    ),
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
  // macroMicro stays 'mock' even with KOSIS_API_KEY set: only construction-cost
  // is genuinely live; the survey sub-fields (vacancy/rent-growth/cap-rate) —
  // the only macro-micro inputs surfaced as provenance — remain synthetic, so
  // labeling them 'live' would be dishonest. See the honesty test below.
  assert.equal(live.macroMicro, 'mock');

  // getConnectorBundle still wires the LIVE KOSIS adapter when keyed (so the
  // genuinely-live construction-cost figure is fetched), even though the
  // reported provenance mode is 'mock'.
  const bundle = getConnectorBundle();
  assert.equal(bundle.rentComps instanceof LiveReoneRentComps, true);
  assert.equal(bundle.useZone instanceof LiveVworldUseZone, true);
  assert.equal(bundle.landPricing instanceof LiveVworldLandPricing, true);
  assert.equal(bundle.macroMicro instanceof LiveKosisMacroMicro, true);
});

test('macro-micro provenance: KOSIS-keyed submarket survey sub-fields are NEVER labeled live', () => {
  clearKeys();
  // Key KOSIS (and only KOSIS) so any leak would be macro-micro–specific.
  process.env.KOSIS_API_KEY = 'k';

  // The mode that drives provenance labeling must report 'mock' for macroMicro,
  // because the survey sub-fields it sources are always synthetic.
  assert.equal(resolveConnectorMode().macroMicro, 'mock');

  // End-to-end: feed the KOSIS-keyed mode through the provenance builder with a
  // bundle whose ONLY cap-rate / occupancy evidence is the (mock) submarket
  // survey. Both must come back IMPUTED and sourced as 'macro-micro (mock)' —
  // i.e. no synthetic value wears a 'live' label.
  const modes = resolveConnectorMode();
  const prov = buildAnalysisProvenance(
    {
      addressInput: '서울특별시 강남구 테헤란로 100',
      parcel: {
        jibunAddress: '서울특별시 강남구 테헤란동 100-1',
        roadAddress: '서울특별시 강남구 테헤란로 100',
        pnu: '1168010500101000001'
      },
      location: { latitude: 37.5, longitude: 127.0 },
      districtName: '강남구',
      building: null,
      zone: {
        pnu: '1168010500101000001',
        primaryZone: '일반상업지역',
        specialDistrict: null,
        urbanPlanFacility: null,
        zoningCode: 'COMMERCIAL_GENERAL'
      },
      landPricing: null,
      grid: null,
      // No rent comps → cap-rate/occupancy must fall through to the submarket
      // survey (the mock-sourced macro-micro fields).
      rentComps: [],
      macroMicro: {
        district: '강남구',
        metroRegion: '서울 강남권',
        submarketVacancyPct: 6,
        submarketRentGrowthPct: 2.5,
        submarketCapRatePct: 4.9,
        submarketInflationPct: 2.2,
        constructionCostPerSqmKrw: 4_200_000,
        notes: 'KOSIS-keyed.'
      },
      assetClass: AssetClass.OFFICE
    },
    {
      mockGeocode: false,
      connectorModes: {
        useZone: modes.useZone,
        landPricing: modes.landPricing,
        rentComps: modes.rentComps,
        macroMicro: modes.macroMicro
      }
    }
  );

  const cap = prov.fields.find((f) => f.field === 'capRate');
  const occ = prov.fields.find((f) => f.field === 'occupancy');
  assert.ok(cap, 'expected a capRate provenance field');
  assert.ok(occ, 'expected an occupancy provenance field');

  // The whole point: these macro-micro–sourced values must not be 'LIVE'.
  assert.notEqual(cap!.tier, 'LIVE');
  assert.notEqual(occ!.tier, 'LIVE');
  assert.equal(cap!.source, 'macro-micro (mock)');
  assert.equal(occ!.source, 'macro-micro (mock)');

  // And no provenance field anywhere claims macro-micro is live.
  for (const f of prov.fields) {
    assert.notEqual(f.source, 'macro-micro (live)');
  }
});
