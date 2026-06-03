/**
 * Geocoder factory with graceful degradation:
 *   1. Kakao Local (KAKAO_REST_API_KEY) — real coords + real 19-digit PNU.
 *   2. OSM Nominatim (ENABLE_OSM_GEOCODER=true) — keyless, real coords for any
 *      Korean address, synthetic PNU.
 *   3. Deterministic demo mock — offline, a handful of anchor areas.
 *
 * CI/tests/dev stay on the mock by default (deterministic, no network). When a
 * live provider is active a genuine "not found" returns null rather than
 * silently falling back to the mock's wrong coordinates; a live provider that
 * is unreachable does fall through to the mock so the page still responds.
 */
import type { LatLng } from '@/lib/services/public-data/types';
import {
  geocodeAddress as mockGeocodeAddress,
  reverseGeocode as mockReverseGeocode
} from './korea-geocode';
import {
  isKakaoConfigured,
  kakaoGeocodeAddress,
  kakaoReverseGeocode,
  type GeocodeResult,
  type ReverseGeocodeResult
} from './kakao-geocode';
import { isOsmGeocoderEnabled, osmGeocodeAddress, osmReverseGeocode } from './osm-geocode';

/** True when a real geocoding provider is wired (used to set MOCK provenance). */
export function isLiveGeocoderConfigured(): boolean {
  return isKakaoConfigured() || isOsmGeocoderEnabled();
}

export async function geocodeAddress(input: string): Promise<GeocodeResult | null> {
  if (isKakaoConfigured()) {
    return kakaoGeocodeAddress(input);
  }
  if (isOsmGeocoderEnabled()) {
    return (await osmGeocodeAddress(input)) ?? mockGeocodeAddress(input);
  }
  return mockGeocodeAddress(input);
}

export async function reverseGeocode(location: LatLng): Promise<ReverseGeocodeResult | null> {
  if (isKakaoConfigured()) {
    return kakaoReverseGeocode(location);
  }
  if (isOsmGeocoderEnabled()) {
    return (await osmReverseGeocode(location)) ?? mockReverseGeocode(location);
  }
  return mockReverseGeocode(location);
}
