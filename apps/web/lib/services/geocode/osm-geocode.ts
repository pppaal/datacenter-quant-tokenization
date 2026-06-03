/**
 * Keyless live geocoder backed by OpenStreetMap Nominatim.
 *
 * Unlike Kakao this needs no API key, so it lets the public analyzer resolve
 * arbitrary Korean addresses to REAL coordinates with nothing but outbound
 * network. Nominatim has no Korean parcel (PNU) registry, so the PNU is a
 * deterministic synthetic id (same approach as the demo fallback) — coordinates
 * and the 구/시 district (which drive zoning + connectors) are real.
 *
 * Gated behind ENABLE_OSM_GEOCODER so CI/tests stay deterministic on the mock.
 * Respect Nominatim usage policy: a descriptive User-Agent + low volume.
 */
import type { LatLng, ParcelIdentifier } from '@/lib/services/public-data/types';
import type { GeocodeResult, ReverseGeocodeResult } from './kakao-geocode';

const ENDPOINT = 'https://nominatim.openstreetmap.org';
const USER_AGENT = 'NexusSeoul-PropertyAnalyzer/1.0 (+https://nexus-seoul.example)';

type OsmAddress = Record<string, string | undefined>;
type OsmPlace = { lat?: string; lon?: string; display_name?: string; address?: OsmAddress };

export function isOsmGeocoderEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.ENABLE_OSM_GEOCODER?.trim().toLowerCase() === 'true';
}

/** Deterministic synthetic 19-digit PNU (OSM has no parcel registry). */
export function syntheticPnu(seed: string): string {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `99${Math.abs(h).toString().padStart(10, '0').slice(0, 10).padEnd(17, '0')}`;
}

/** Pick the 구 (preferred) / 시 / 군 token from Nominatim address components. */
export function districtFromOsmAddress(address?: OsmAddress): string {
  const values = Object.values(address ?? {}).filter((v): v is string => Boolean(v));
  return (
    values.find((v) => v.endsWith('구')) ??
    values.find((v) => v.endsWith('시')) ??
    values.find((v) => v.endsWith('군')) ??
    ''
  );
}

export function parcelFromOsmPlace(place: OsmPlace, label: string): ParcelIdentifier {
  const jibun =
    label.trim() ||
    place.display_name
      ?.split(',')
      .map((s) => s.trim())
      .reverse()
      .join(' ') ||
    '';
  return { jibunAddress: jibun, roadAddress: null, pnu: syntheticPnu(jibun) };
}

async function osmFetch(path: string, params: Record<string, string>): Promise<unknown> {
  const url = `${ENDPOINT}${path}?${new URLSearchParams(params).toString()}`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'ko' },
      signal: AbortSignal.timeout(6000)
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function osmGeocodeAddress(input: string): Promise<GeocodeResult | null> {
  const data = (await osmFetch('/search', {
    q: input.trim(),
    format: 'jsonv2',
    addressdetails: '1',
    limit: '1',
    countrycodes: 'kr'
  })) as OsmPlace[] | null;
  const top = data?.[0];
  if (!top?.lat || !top?.lon) return null;
  const latitude = Number(top.lat);
  const longitude = Number(top.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return {
    parcel: parcelFromOsmPlace(top, input),
    location: { latitude, longitude },
    districtName: districtFromOsmAddress(top.address)
  };
}

export async function osmReverseGeocode(location: LatLng): Promise<ReverseGeocodeResult | null> {
  const place = (await osmFetch('/reverse', {
    lat: String(location.latitude),
    lon: String(location.longitude),
    format: 'jsonv2',
    addressdetails: '1'
  })) as OsmPlace | null;
  if (!place) return null;
  const label =
    place.display_name
      ?.split(',')
      .map((s) => s.trim())
      .reverse()
      .join(' ') ?? '';
  return {
    parcel: parcelFromOsmPlace(place, label),
    districtName: districtFromOsmAddress(place.address)
  };
}
