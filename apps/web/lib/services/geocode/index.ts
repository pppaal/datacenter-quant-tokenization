/**
 * Geocoder factory. Uses the live Kakao Local geocoder when
 * `KAKAO_REST_API_KEY` is configured, and otherwise falls back to the
 * deterministic mock so local/dev/CI/demo keep working with no external
 * dependency. When the live provider is active a genuine "not found" returns
 * null (we do NOT silently fall back to the mock's wrong coordinates).
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

/** True when a real geocoding provider is wired (used to set MOCK provenance). */
export function isLiveGeocoderConfigured(): boolean {
  return isKakaoConfigured();
}

export async function geocodeAddress(input: string): Promise<GeocodeResult | null> {
  if (isKakaoConfigured()) {
    return kakaoGeocodeAddress(input);
  }
  return mockGeocodeAddress(input);
}

export async function reverseGeocode(location: LatLng): Promise<ReverseGeocodeResult | null> {
  if (isKakaoConfigured()) {
    return kakaoReverseGeocode(location);
  }
  return mockReverseGeocode(location);
}
