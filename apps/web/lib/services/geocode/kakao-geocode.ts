/**
 * Live Korean geocoder backed by the Kakao Local REST API.
 *
 * A single address search returns coordinates + the 법정동 code and parcel
 * numbers, from which we reconstruct the 19-digit PNU (the stable join key the
 * downstream public-data connectors expect). Active only when
 * `KAKAO_REST_API_KEY` is set; otherwise the factory in `./index` falls back to
 * the deterministic mock so local/dev/demo keeps working.
 *
 * Docs: https://developers.kakao.com/docs/latest/ko/local/dev-guide
 */
import type { LatLng, ParcelIdentifier } from '@/lib/services/public-data/types';

export type GeocodeResult = {
  parcel: ParcelIdentifier;
  location: LatLng;
  districtName: string;
};

export type ReverseGeocodeResult = {
  parcel: ParcelIdentifier;
  districtName: string;
};

// The subset of the Kakao `address` object we consume.
type KakaoAddress = {
  address_name?: string;
  region_2depth_name?: string;
  region_3depth_name?: string;
  mountain_yn?: string;
  main_address_no?: string;
  sub_address_no?: string;
  b_code?: string;
};

type KakaoRoadAddress = { address_name?: string };

type KakaoAddressDoc = {
  address?: KakaoAddress | null;
  road_address?: KakaoRoadAddress | null;
  x?: string; // longitude
  y?: string; // latitude
};

export function isKakaoConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.KAKAO_REST_API_KEY?.trim());
}

/**
 * Compose the 19-digit PNU from a Kakao 법정동 code + parcel numbers:
 * 법정동코드(10) + 필지구분(1: 1=일반/2=산) + 본번(4) + 부번(4). Returns null when
 * the legal-dong code is missing/short (so callers can degrade gracefully).
 */
export function buildPnu(parts: {
  bCode?: string | null;
  mountainYn?: string | null;
  mainNo?: string | null;
  subNo?: string | null;
}): string | null {
  const bCode = (parts.bCode ?? '').trim();
  if (bCode.length !== 10 || !/^\d{10}$/.test(bCode)) return null;
  const mountain = parts.mountainYn === 'Y' ? '2' : '1';
  const pad4 = (v: string | null | undefined) =>
    String(Number.parseInt(v ?? '0', 10) || 0)
      .padStart(4, '0')
      .slice(-4);
  return `${bCode}${mountain}${pad4(parts.mainNo)}${pad4(parts.subNo)}`;
}

/** Map a Kakao address document → our ParcelIdentifier (pure, testable). */
export function parcelFromKakaoDoc(doc: KakaoAddressDoc): ParcelIdentifier | null {
  const jibun = doc.address?.address_name?.trim();
  if (!jibun) return null;
  return {
    jibunAddress: jibun,
    roadAddress: doc.road_address?.address_name?.trim() || null,
    pnu:
      buildPnu({
        bCode: doc.address?.b_code,
        mountainYn: doc.address?.mountain_yn,
        mainNo: doc.address?.main_address_no,
        subNo: doc.address?.sub_address_no
      }) ?? ''
  };
}

export function districtFromKakaoAddress(address?: KakaoAddress | null): string {
  return address?.region_2depth_name?.trim() || address?.region_3depth_name?.trim() || '';
}

async function kakaoFetch(
  path: string,
  params: Record<string, string>
): Promise<{ documents?: unknown[] } | null> {
  const key = process.env.KAKAO_REST_API_KEY?.trim();
  if (!key) return null;
  const url = `https://dapi.kakao.com${path}?${new URLSearchParams(params).toString()}`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `KakaoAK ${key}` },
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) return null;
    return (await res.json()) as { documents?: unknown[] };
  } catch {
    return null;
  }
}

export async function kakaoGeocodeAddress(input: string): Promise<GeocodeResult | null> {
  const data = await kakaoFetch('/v2/local/search/address.json', {
    query: input.trim(),
    size: '1'
  });
  const doc = data?.documents?.[0] as KakaoAddressDoc | undefined;
  if (!doc || doc.x == null || doc.y == null) return null;
  const parcel = parcelFromKakaoDoc(doc);
  if (!parcel) return null;
  return {
    parcel,
    location: { latitude: Number(doc.y), longitude: Number(doc.x) },
    districtName: districtFromKakaoAddress(doc.address)
  };
}

export async function kakaoReverseGeocode(location: LatLng): Promise<ReverseGeocodeResult | null> {
  const params = { x: String(location.longitude), y: String(location.latitude) };
  const [addrData, regionData] = await Promise.all([
    kakaoFetch('/v2/local/geo/coord2address.json', params),
    kakaoFetch('/v2/local/geo/coord2regioncode.json', params)
  ]);
  const doc = addrData?.documents?.[0] as KakaoAddressDoc | undefined;
  if (!doc) return null;
  // coord2address omits b_code; pull the 법정동(B) code from coord2regioncode.
  const region = (
    (regionData?.documents ?? []) as Array<{ region_type?: string; code?: string }>
  ).find((d) => d.region_type === 'B');
  const enriched: KakaoAddressDoc = {
    ...doc,
    address: { ...(doc.address ?? {}), b_code: region?.code ?? doc.address?.b_code }
  };
  const parcel = parcelFromKakaoDoc(enriched);
  if (!parcel) return null;
  return { parcel, districtName: districtFromKakaoAddress(enriched.address) };
}
