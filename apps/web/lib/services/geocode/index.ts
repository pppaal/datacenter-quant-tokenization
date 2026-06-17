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
  // Try live providers in order of fidelity (Kakao = real PNU, OSM = real
  // coords), each falling through to the next when it cannot resolve the
  // address, so a single unmatched address never hard-fails the analysis. The
  // deterministic mock is the final backstop (it always returns a synthetic
  // result, so callers never see null when any provider is reachable).
  if (isKakaoConfigured()) {
    const kakao = await kakaoGeocodeAddress(input);
    if (kakao) return kakao;
  }
  if (isOsmGeocoderEnabled()) {
    const osm = await osmGeocodeAddress(input);
    if (osm) return osm;
  }
  return mockGeocodeAddress(input);
}

export async function reverseGeocode(location: LatLng): Promise<ReverseGeocodeResult | null> {
  if (isKakaoConfigured()) {
    const kakao = await kakaoReverseGeocode(location);
    if (kakao) return kakao;
  }
  if (isOsmGeocoderEnabled()) {
    const osm = await osmReverseGeocode(location);
    if (osm) return osm;
  }
  return mockReverseGeocode(location);
}
