import assert from 'node:assert/strict';
import test from 'node:test';
import {
  geocodeAddress,
  reverseGeocode,
  KNOWN_ADDRESSES
} from '@/lib/services/geocode/korea-geocode';
import type { LatLng } from '@/lib/services/public-data/types';

/**
 * Great-circle nearest-anchor selection. The mock reverse geocoder must scale
 * the longitude delta by cos(latitude) — at Korean latitudes (~37.5°N) 1° of
 * longitude covers only ~79% of the ground that 1° of latitude does, so a naive
 * sqrt(dLat² + dLng²) over raw degrees can select the wrong nearest anchor.
 */

const toRad = (deg: number) => (deg * Math.PI) / 180;
function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function trueNearest(loc: LatLng) {
  return KNOWN_ADDRESSES.map((addr) => ({
    addr,
    km: haversineKm(loc, { latitude: addr.latitude, longitude: addr.longitude })
  })).sort((a, b) => a.km - b.km)[0]!.addr;
}

test('reverseGeocode resolves exact anchor coordinates to themselves', () => {
  for (const known of KNOWN_ADDRESSES) {
    const result = reverseGeocode({ latitude: known.latitude, longitude: known.longitude });
    assert.equal(result?.parcel.pnu, known.pnu);
  }
});

test('reverseGeocode picks the true great-circle nearest anchor (longitude scaling)', () => {
  // This query lies between Pyeongtaek (37.01837,127.09641) and Anseong
  // (37.02219,127.12843). By true ground distance Anseong is nearer, but an
  // unscaled lat/lng metric over-weights the east-west gap and wrongly returns
  // Pyeongtaek. The cos(lat) scaling must restore the correct pick.
  const query: LatLng = { latitude: 37.04, longitude: 127.11 };
  const expected = trueNearest(query);
  assert.equal(expected.districtName, '안성시'); // sanity: ground truth is Anseong

  const result = reverseGeocode(query);
  assert.equal(result?.districtName, '안성시');
  assert.equal(result?.parcel.pnu, expected.pnu);
});

test('reverseGeocode matches haversine ground truth across a Gyeonggi grid', () => {
  for (let lat = 36.95; lat <= 37.1; lat += 0.02) {
    for (let lng = 127.0; lng <= 127.2; lng += 0.02) {
      const query: LatLng = { latitude: +lat.toFixed(3), longitude: +lng.toFixed(3) };
      const expected = trueNearest(query);
      const result = reverseGeocode(query);
      assert.equal(
        result?.parcel.pnu,
        expected.pnu,
        `mismatch at ${JSON.stringify(query)}: got ${result?.districtName}, expected ${expected.districtName}`
      );
    }
  }
});

test('geocodeAddress still resolves a known exact jibun address', () => {
  const known = KNOWN_ADDRESSES[0]!;
  const result = geocodeAddress(known.jibunAddress);
  assert.equal(result?.parcel.pnu, known.pnu);
  assert.equal(result?.location.latitude, known.latitude);
});
