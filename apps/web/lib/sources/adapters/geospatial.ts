import { SourceStatus } from '@prisma/client';
import { DEFAULT_FALLBACK_SOURCE_DATA, FALLBACK_SOURCE_DATA } from '@/lib/sources/fallback-data';
import { fetchJsonWithRetry, type Fetcher } from '@/lib/sources/http';
import type { SourceCacheStore, SourceEnvelope } from '@/lib/sources/types';

export type GeospatialData = {
  latitude: number;
  longitude: number;
  parcelId: string;
  gridAvailability: string;
  fiberAccess: string;
  latencyProfile: string;
  floodRiskScore: number;
  seismicRiskScore: number;
};

type Input = {
  assetCode: string;
  address: string;
  city: string;
  province: string;
};

type JusoSearchRow = {
  roadAddr?: string;
  admCd?: string;
  rnMgtSn?: string;
  udrtYn?: string;
  buldMnnm?: string;
  buldSlno?: string;
};

type JusoResponse<T> = {
  results?: {
    common?: {
      errorCode?: string;
      errorMessage?: string;
    };
    juso?: T[];
  };
};

function sanitizeKeyword(value: string) {
  return value.replace(/[%=><]/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseKoreaLongitude(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 120 && parsed <= 140 ? parsed : null;
}

function parseKoreaLatitude(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 30 && parsed <= 45 ? parsed : null;
}

export function createGeospatialAdapter(store: SourceCacheStore, fetcher?: Fetcher) {
  return {
    async fetch(input: Input): Promise<SourceEnvelope<GeospatialData>> {
      const sourceSystem = process.env.KOREA_GEOSPATIAL_API_URL ? 'korea-geospatial' : 'juso-address';
      const cacheKey = input.assetCode;
      const now = new Date();
      const override = await store.getOverride<GeospatialData>(sourceSystem, cacheKey);

      if (override) {
        return {
          sourceSystem,
          status: SourceStatus.MANUAL,
          mode: 'manual',
          fetchedAt: now,
          expiresAt: now,
          freshnessLabel: 'manual override',
          data: override,
          provenance: Object.entries(override).map(([field, value]) => ({
            field,
            value: typeof value === 'number' || typeof value === 'string' ? value : null,
            sourceSystem,
            mode: 'manual',
            fetchedAt: now.toISOString(),
            freshnessLabel: 'manual override'
          }))
        };
      }

      const cached = await store.getFreshCache<GeospatialData>(sourceSystem, cacheKey, now);
      if (cached) {
        return {
          sourceSystem,
          status: cached.status,
          mode: 'cache',
          fetchedAt: cached.fetchedAt,
          expiresAt: cached.expiresAt,
          freshnessLabel: cached.freshnessLabel,
          data: cached.payload,
          provenance: Object.entries(cached.payload).map(([field, value]) => ({
            field,
            value: typeof value === 'number' || typeof value === 'string' ? value : null,
            sourceSystem,
            mode: 'cache',
            fetchedAt: cached.fetchedAt.toISOString(),
            freshnessLabel: cached.freshnessLabel
          }))
        };
      }

      const fallback =
        FALLBACK_SOURCE_DATA.geospatial[input.assetCode as keyof typeof FALLBACK_SOURCE_DATA.geospatial] ??
        DEFAULT_FALLBACK_SOURCE_DATA.geospatial;
      const ttlHours = Number(process.env.SOURCE_CACHE_TTL_HOURS ?? 24);

      try {
        let data: GeospatialData;

        if (process.env.KOREA_GEOSPATIAL_API_URL) {
          const url = new URL(process.env.KOREA_GEOSPATIAL_API_URL);
          url.searchParams.set('address', `${input.address}, ${input.city}, ${input.province}`);
          url.searchParams.set('assetCode', input.assetCode);
          const payload = (await fetchJsonWithRetry(
            url.toString(),
            {
              headers: {
                Authorization: `Bearer ${process.env.KOREA_GEOSPATIAL_API_KEY || ''}`
              },
              cache: 'no-store'
            },
            { fetcher }
          )) as Partial<GeospatialData>;

          data = {
            latitude: Number(payload.latitude ?? fallback.latitude),
            longitude: Number(payload.longitude ?? fallback.longitude),
            parcelId: String(payload.parcelId ?? fallback.parcelId),
            gridAvailability: String(payload.gridAvailability ?? fallback.gridAvailability),
            fiberAccess: String(payload.fiberAccess ?? fallback.fiberAccess),
            latencyProfile: String(payload.latencyProfile ?? fallback.latencyProfile),
            floodRiskScore: Number(payload.floodRiskScore ?? fallback.floodRiskScore),
            seismicRiskScore: Number(payload.seismicRiskScore ?? fallback.seismicRiskScore)
          };
        } else {
          const confmKey = process.env.KOREA_JUSO_API_KEY;
          if (!confmKey) throw new Error('missing_juso_key');

          const searchUrl = new URL(
            process.env.KOREA_JUSO_SEARCH_API_URL || 'https://business.juso.go.kr/addrlink/addrLinkApi.do'
          );
          searchUrl.searchParams.set('confmKey', confmKey);
          searchUrl.searchParams.set('currentPage', '1');
          searchUrl.searchParams.set('countPerPage', '10');
          searchUrl.searchParams.set('keyword', sanitizeKeyword(`${input.address} ${input.city} ${input.province}`));
          searchUrl.searchParams.set('resultType', 'json');

          const searchPayload = (await fetchJsonWithRetry(
            searchUrl.toString(),
            { cache: 'no-store' },
            { fetcher }
          )) as JusoResponse<JusoSearchRow>;

          const searchCommon = searchPayload.results?.common;
          if (searchCommon?.errorCode && searchCommon.errorCode !== '0') {
            throw new Error(`juso_search:${searchCommon.errorCode}:${searchCommon.errorMessage || 'unknown'}`);
          }

          const first = searchPayload.results?.juso?.[0];
          if (!first?.admCd || !first.rnMgtSn || !first.buldMnnm) {
            throw new Error('juso_search:no_match');
          }

          const coordUrl = new URL(
            process.env.KOREA_JUSO_COORD_API_URL || 'https://business.juso.go.kr/addrlink/addrCoordApi.do'
          );
          coordUrl.searchParams.set('confmKey', confmKey);
          coordUrl.searchParams.set('admCd', first.admCd);
          coordUrl.searchParams.set('rnMgtSn', first.rnMgtSn);
          coordUrl.searchParams.set('udrtYn', first.udrtYn || '0');
          coordUrl.searchParams.set('buldMnnm', first.buldMnnm);
          coordUrl.searchParams.set('buldSlno', first.buldSlno || '0');
          coordUrl.searchParams.set('resultType', 'json');

          const coordPayload = (await fetchJsonWithRetry(
            coordUrl.toString(),
            { cache: 'no-store' },
            { fetcher }
          )) as JusoResponse<{ entX?: string; entY?: string }>;

          const coordCommon = coordPayload.results?.common;
          if (coordCommon?.errorCode && coordCommon.errorCode !== '0') {
            throw new Error(`juso_coord:${coordCommon.errorCode}:${coordCommon.errorMessage || 'unknown'}`);
          }

          const coord = coordPayload.results?.juso?.[0];
          data = {
            latitude: parseKoreaLatitude(coord?.entY) ?? fallback.latitude,
            longitude: parseKoreaLongitude(coord?.entX) ?? fallback.longitude,
            parcelId: `${first.admCd}-${first.rnMgtSn}-${first.buldMnnm}-${first.buldSlno || '0'}`,
            gridAvailability: fallback.gridAvailability,
            fiberAccess: fallback.fiberAccess,
            latencyProfile: `Juso normalized address: ${first.roadAddr || `${input.address}, ${input.city}`}`,
            floodRiskScore: fallback.floodRiskScore,
            seismicRiskScore: fallback.seismicRiskScore
          };
        }

        const entry = {
          status: SourceStatus.FRESH,
          payload: data,
          fetchedAt: now,
          expiresAt: new Date(now.getTime() + ttlHours * 60 * 60 * 1000),
          freshnessLabel: 'fresh api',
          attempts: 1
        };
        await store.upsertCache(sourceSystem, cacheKey, entry);

        return {
          sourceSystem,
          status: SourceStatus.FRESH,
          mode: 'api',
          fetchedAt: entry.fetchedAt,
          expiresAt: entry.expiresAt,
          freshnessLabel: entry.freshnessLabel,
          data,
          provenance: Object.entries(data).map(([field, value]) => ({
            field,
            value: typeof value === 'number' || typeof value === 'string' ? value : null,
            sourceSystem,
            mode: 'api',
            fetchedAt: entry.fetchedAt.toISOString(),
            freshnessLabel: entry.freshnessLabel
          }))
        };
      } catch (error) {
        const entry = {
          status: SourceStatus.STALE,
          payload: fallback,
          fetchedAt: now,
          expiresAt: new Date(now.getTime() + ttlHours * 60 * 60 * 1000),
          freshnessLabel: 'fallback dataset',
          errorMessage: (error as Error).message,
          attempts: 1
        };
        await store.upsertCache(sourceSystem, cacheKey, entry);

        return {
          sourceSystem,
          status: SourceStatus.STALE,
          mode: 'fallback',
          fetchedAt: entry.fetchedAt,
          expiresAt: entry.expiresAt,
          freshnessLabel: entry.freshnessLabel,
          data: fallback,
          provenance: Object.entries(fallback).map(([field, value]) => ({
            field,
            value: typeof value === 'number' || typeof value === 'string' ? value : null,
            sourceSystem,
            mode: 'fallback',
            fetchedAt: entry.fetchedAt.toISOString(),
            freshnessLabel: entry.freshnessLabel
          }))
        };
      }
    }
  };
}
