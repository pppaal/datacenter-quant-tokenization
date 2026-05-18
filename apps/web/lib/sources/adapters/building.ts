import { SourceStatus } from '@prisma/client';
import { DEFAULT_FALLBACK_SOURCE_DATA, FALLBACK_SOURCE_DATA } from '@/lib/sources/fallback-data';
import { fetchJsonWithRetry, type Fetcher } from '@/lib/sources/http';
import type { SourceCacheStore, SourceEnvelope } from '@/lib/sources/types';

export type BuildingPermitData = {
  zoning: string;
  permitStage: string;
  zoningApprovalStatus: string;
  environmentalReviewStatus: string;
  powerApprovalStatus: string;
  buildingCoveragePct: number;
  floorAreaRatioPct: number;
  redundancyTier: string;
  coolingType: string;
  structureDescription: string;
};

export function createBuildingPermitAdapter(store: SourceCacheStore, fetcher?: Fetcher) {
  const sourceSystem = 'korea-building-permit';

  return {
    async fetch(assetCode: string): Promise<SourceEnvelope<BuildingPermitData>> {
      const now = new Date();
      const cached = await store.getFreshCache<BuildingPermitData>(sourceSystem, assetCode, now);
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
        FALLBACK_SOURCE_DATA.building[assetCode as keyof typeof FALLBACK_SOURCE_DATA.building] ??
        DEFAULT_FALLBACK_SOURCE_DATA.building;
      const ttlHours = Number(process.env.SOURCE_CACHE_TTL_HOURS ?? 24);

      try {
        if (!process.env.KOREA_BUILDING_API_URL) throw new Error('missing_endpoint');
        const url = new URL(process.env.KOREA_BUILDING_API_URL);
        url.searchParams.set('assetCode', assetCode);
        const payload = (await fetchJsonWithRetry(
          url.toString(),
          {
            headers: {
              Authorization: `Bearer ${process.env.KOREA_BUILDING_API_KEY || ''}`
            },
            cache: 'no-store'
          },
          { fetcher }
        )) as Partial<BuildingPermitData>;

        const data: BuildingPermitData = {
          zoning: String(payload.zoning ?? fallback.zoning),
          permitStage: String(payload.permitStage ?? fallback.permitStage),
          zoningApprovalStatus: String(
            payload.zoningApprovalStatus ?? fallback.zoningApprovalStatus
          ),
          environmentalReviewStatus: String(
            payload.environmentalReviewStatus ?? fallback.environmentalReviewStatus
          ),
          powerApprovalStatus: String(payload.powerApprovalStatus ?? fallback.powerApprovalStatus),
          buildingCoveragePct: Number(payload.buildingCoveragePct ?? fallback.buildingCoveragePct),
          floorAreaRatioPct: Number(payload.floorAreaRatioPct ?? fallback.floorAreaRatioPct),
          redundancyTier: String(payload.redundancyTier ?? fallback.redundancyTier),
          coolingType: String(payload.coolingType ?? fallback.coolingType),
          structureDescription: String(
            payload.structureDescription ?? fallback.structureDescription
          )
        };

        const entry = {
          status: SourceStatus.FRESH,
          payload: data,
          fetchedAt: now,
          expiresAt: new Date(now.getTime() + ttlHours * 60 * 60 * 1000),
          freshnessLabel: 'fresh api'
        };
        await store.upsertCache(sourceSystem, assetCode, entry);

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
      } catch {
        const entry = {
          status: SourceStatus.STALE,
          payload: fallback,
          fetchedAt: now,
          expiresAt: new Date(now.getTime() + ttlHours * 60 * 60 * 1000),
          freshnessLabel: 'fallback dataset'
        };
        await store.upsertCache(sourceSystem, assetCode, entry);

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
