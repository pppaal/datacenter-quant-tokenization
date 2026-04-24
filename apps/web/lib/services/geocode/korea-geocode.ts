/**
 * Mock Korean geocoder — resolves address ↔ coordinates ↔ parcel identifier.
 * Real source: VWorld 지오코딩 API, 카카오 Local API, 주소기반산업지원서비스.
 *
 * Returns realistic lat/lng + PNU for a handful of well-known Korean addresses,
 * plus deterministic fallback hashing for unknown inputs.
 */

import type { LatLng, ParcelIdentifier } from '@/lib/services/public-data/types';

type KnownAddress = {
  jibunAddress: string;
  roadAddress: string;
  latitude: number;
  longitude: number;
  pnu: string;
  districtName: string; // "구/시"
};

// Real-world anchor addresses used for demos. Coordinates are genuine WGS84.
export const KNOWN_ADDRESSES: KnownAddress[] = [
  {
    jibunAddress: '서울특별시 강남구 압구정동 458-7',
    roadAddress: '서울특별시 강남구 압구정로 340',
    latitude: 37.52738,
    longitude: 127.03885,
    pnu: '1168010400104580007',
    districtName: '강남구'
  },
  {
    jibunAddress: '서울특별시 강남구 청담동 90-1',
    roadAddress: '서울특별시 강남구 도산대로 450',
    latitude: 37.52454,
    longitude: 127.04668,
    pnu: '1168010500100900001',
    districtName: '강남구'
  },
  {
    jibunAddress: '서울특별시 영등포구 여의도동 23',
    roadAddress: '서울특별시 영등포구 국제금융로 10',
    latitude: 37.52140,
    longitude: 126.92573,
    pnu: '1156011000100230000',
    districtName: '영등포구'
  },
  {
    jibunAddress: '서울특별시 성동구 성수동2가 333-19',
    roadAddress: '서울특별시 성동구 성수이로 118',
    latitude: 37.54412,
    longitude: 127.05591,
    pnu: '1120017200103330019',
    districtName: '성동구'
  },
  {
    jibunAddress: '서울특별시 강서구 마곡동 797',
    roadAddress: '서울특별시 강서구 마곡중앙로 161-8',
    latitude: 37.56032,
    longitude: 126.83754,
    pnu: '1150010800107970000',
    districtName: '강서구'
  },
  {
    jibunAddress: '경기도 평택시 고덕면 여염리 산 84',
    roadAddress: '경기도 평택시 고덕면 삼성로 114',
    latitude: 37.01837,
    longitude: 127.09641,
    pnu: '4122035021200840000',
    districtName: '평택시'
  },
  {
    jibunAddress: '경기도 안성시 원곡면 산하리 산 47',
    roadAddress: '경기도 안성시 원곡면 농촌길 47',
    latitude: 37.02219,
    longitude: 127.12843,
    pnu: '4155035027200470000',
    districtName: '안성시'
  },
  {
    jibunAddress: '경기도 파주시 문발동 638',
    roadAddress: '경기도 파주시 회동길 77',
    latitude: 37.71894,
    longitude: 126.75493,
    pnu: '4148010700106380000',
    districtName: '파주시'
  }
];

function stableHashPnu(address: string): string {
  let h = 2166136261;
  for (let i = 0; i < address.length; i++) {
    h ^= address.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const base = Math.abs(h).toString().padStart(10, '0').slice(0, 10);
  return `99${base.padEnd(17, '0')}`;
}

export function geocodeAddress(input: string): {
  parcel: ParcelIdentifier;
  location: LatLng;
  districtName: string;
} | null {
  const trimmed = input.trim();
  // Exact match first
  const exact = KNOWN_ADDRESSES.find(
    (k) => k.jibunAddress === trimmed || k.roadAddress === trimmed
  );
  if (exact) {
    return {
      parcel: {
        jibunAddress: exact.jibunAddress,
        roadAddress: exact.roadAddress,
        pnu: exact.pnu
      },
      location: { latitude: exact.latitude, longitude: exact.longitude },
      districtName: exact.districtName
    };
  }

  // Substring / district match fallback — so "압구정동" still resolves.
  const loose = KNOWN_ADDRESSES.find(
    (k) => trimmed.includes(k.districtName) || k.jibunAddress.includes(trimmed)
  );
  if (loose) {
    return {
      parcel: {
        jibunAddress: loose.jibunAddress,
        roadAddress: loose.roadAddress,
        pnu: stableHashPnu(trimmed)
      },
      location: { latitude: loose.latitude, longitude: loose.longitude },
      districtName: loose.districtName
    };
  }

  return null;
}

export function reverseGeocode(location: LatLng): {
  parcel: ParcelIdentifier;
  districtName: string;
} | null {
  // Pick the nearest known address by great-circle distance.
  let best: { addr: KnownAddress; distance: number } | null = null;
  for (const addr of KNOWN_ADDRESSES) {
    const dLat = addr.latitude - location.latitude;
    const dLng = addr.longitude - location.longitude;
    const distance = Math.sqrt(dLat * dLat + dLng * dLng);
    if (!best || distance < best.distance) {
      best = { addr, distance };
    }
  }
  if (!best) return null;
  return {
    parcel: {
      jibunAddress: best.addr.jibunAddress,
      roadAddress: best.addr.roadAddress,
      pnu: best.addr.pnu
    },
    districtName: best.addr.districtName
  };
}
