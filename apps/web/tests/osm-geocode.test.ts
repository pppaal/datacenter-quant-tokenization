import assert from 'node:assert/strict';
import test from 'node:test';
import {
  districtFromOsmAddress,
  isOsmGeocoderEnabled,
  parcelFromOsmPlace,
  syntheticPnu
} from '@/lib/services/geocode/osm-geocode';

test('districtFromOsmAddress prefers 구, then 시, then 군', () => {
  assert.equal(
    districtFromOsmAddress({ borough: '강남구', city: '서울특별시', province: '서울특별시' }),
    '강남구'
  );
  assert.equal(districtFromOsmAddress({ city: '평택시', province: '경기도' }), '평택시');
  assert.equal(districtFromOsmAddress({ county: '울릉군', province: '경상북도' }), '울릉군');
  assert.equal(districtFromOsmAddress({}), '');
  assert.equal(districtFromOsmAddress(undefined), '');
});

test('syntheticPnu is a deterministic 19-digit id', () => {
  const p = syntheticPnu('서울특별시 강남구 테헤란로 152');
  assert.match(p, /^\d{19}$/);
  assert.equal(p, syntheticPnu('서울특별시 강남구 테헤란로 152'));
  assert.notEqual(p, syntheticPnu('부산광역시 해운대구 우동 1500'));
});

test('parcelFromOsmPlace uses the query label and a synthetic PNU', () => {
  const parcel = parcelFromOsmPlace(
    { display_name: '152, 테헤란로, 강남구, 서울특별시, 대한민국', address: {} },
    '서울특별시 강남구 테헤란로 152'
  );
  assert.equal(parcel.jibunAddress, '서울특별시 강남구 테헤란로 152');
  assert.equal(parcel.roadAddress, null);
  assert.match(parcel.pnu, /^\d{19}$/);
});

test('isOsmGeocoderEnabled reads the flag', () => {
  assert.equal(
    isOsmGeocoderEnabled({ ENABLE_OSM_GEOCODER: 'true' } as unknown as NodeJS.ProcessEnv),
    true
  );
  assert.equal(
    isOsmGeocoderEnabled({ ENABLE_OSM_GEOCODER: 'false' } as unknown as NodeJS.ProcessEnv),
    false
  );
  assert.equal(isOsmGeocoderEnabled({} as unknown as NodeJS.ProcessEnv), false);
});
