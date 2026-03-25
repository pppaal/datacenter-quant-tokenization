import { SourceStatus, type AssetClass } from '@prisma/client';
import { fetchJsonWithRetry, type Fetcher } from '@/lib/sources/http';
import type { SourceCacheStore, SourceEnvelope } from '@/lib/sources/types';

export type MarketIndicatorData = {
  indicatorKey: string;
  value: number;
  unit: string | null;
  observationDate: string | null;
  region: string | null;
};

export type MarketTransactionCompData = {
  label: string;
  region: string;
  comparableType: string;
  transactionDate: string | null;
  priceKrw: number | null;
  pricePerSqmKrw: number | null;
  pricePerMwKrw: number | null;
  capRatePct: number | null;
  buyerType: string | null;
  sellerType: string | null;
  sourceLink: string | null;
  grossFloorAreaSqm: number | null;
};

export type MarketRentCompData = {
  region: string;
  comparableType: string;
  observationDate: string | null;
  monthlyRentPerSqmKrw: number | null;
  monthlyRatePerKwKrw: number | null;
  occupancyPct: number | null;
  escalationPct: number | null;
  sourceLink: string | null;
};

export type MarketData = {
  metroRegion?: string | null;
  vacancyPct?: number | null;
  capRatePct?: number | null;
  rentGrowthPct?: number | null;
  transactionVolumeIndex?: number | null;
  marketNotes?: string | null;
  comparableSetName?: string | null;
  comparableSetNotes?: string | null;
  indicators: MarketIndicatorData[];
  transactionComps: MarketTransactionCompData[];
  rentComps: MarketRentCompData[];
};

export type MarketFetchInput = {
  assetCode: string;
  assetClass: AssetClass;
  market?: string | null;
  country?: string | null;
  metroRegion?: string | null;
};

type NormalizedIndicatorCandidate = {
  indicatorKey: string;
  value: number | null;
  unit: string | null;
  observationDate: string | null;
  region: string | null;
};

type NormalizedTransactionCompCandidate = {
  label: string;
  region: string;
  comparableType: string;
  transactionDate: string | null;
  priceKrw: number | null;
  pricePerSqmKrw: number | null;
  pricePerMwKrw: number | null;
  capRatePct: number | null;
  buyerType: string | null;
  sellerType: string | null;
  sourceLink: string | null;
  grossFloorAreaSqm: number | null;
};

type NormalizedRentCompCandidate = {
  region: string;
  comparableType: string;
  observationDate: string | null;
  monthlyRentPerSqmKrw: number | null;
  monthlyRatePerKwKrw: number | null;
  occupancyPct: number | null;
  escalationPct: number | null;
  sourceLink: string | null;
};

const EMPTY_MARKET_DATA: MarketData = {
  metroRegion: null,
  vacancyPct: null,
  capRatePct: null,
  rentGrowthPct: null,
  transactionVolumeIndex: null,
  marketNotes: null,
  comparableSetName: null,
  comparableSetNotes: null,
  indicators: [],
  transactionComps: [],
  rentComps: []
};

function normalizeMarket(input?: string | null) {
  return String(input ?? 'KR').trim().toUpperCase();
}

function normalizeNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function isNormalizedIndicator(candidate: NormalizedIndicatorCandidate): candidate is MarketIndicatorData {
  return candidate.indicatorKey.length > 0 && candidate.value !== null;
}

function isNormalizedTransactionComp(
  candidate: NormalizedTransactionCompCandidate
): candidate is MarketTransactionCompData {
  return candidate.label.length > 0 && candidate.region.length > 0 && candidate.comparableType.length > 0;
}

function isNormalizedRentComp(candidate: NormalizedRentCompCandidate): candidate is MarketRentCompData {
  return (
    candidate.region.length > 0 &&
    candidate.comparableType.length > 0 &&
    (candidate.monthlyRentPerSqmKrw !== null || candidate.monthlyRatePerKwKrw !== null)
  );
}

export function createMarketAdapter(store: SourceCacheStore, fetcher?: Fetcher) {
  const sourceSystem = 'global-market-api';

  return {
    async fetch(input: MarketFetchInput): Promise<SourceEnvelope<MarketData>> {
      const market = normalizeMarket(input.country ?? input.market);
      const cacheKey = `${market}:${input.assetClass}:${input.assetCode}`;
      const now = new Date();
      const cached = await store.getFreshCache<MarketData>(sourceSystem, cacheKey, now);
      if (cached) {
        return {
          sourceSystem,
          status: cached.status,
          mode: 'cache',
          fetchedAt: cached.fetchedAt,
          expiresAt: cached.expiresAt,
          freshnessLabel: cached.freshnessLabel,
          data: cached.payload,
          provenance: [
            {
              field: 'market-api',
              value: cached.payload.transactionComps.length + cached.payload.rentComps.length,
              sourceSystem,
              mode: 'cache',
              fetchedAt: cached.fetchedAt.toISOString(),
              freshnessLabel: cached.freshnessLabel
            }
          ]
        };
      }

      const ttlHours = Number(process.env.SOURCE_CACHE_TTL_HOURS ?? 24);

      try {
        const endpoint = process.env.GLOBAL_MARKET_API_URL || process.env.US_MARKET_API_URL;
        const apiKey = process.env.GLOBAL_MARKET_API_KEY || process.env.US_MARKET_API_KEY || '';
        if (!endpoint) throw new Error('missing_endpoint');

        const url = new URL(endpoint);
        url.searchParams.set('assetCode', input.assetCode);
        url.searchParams.set('assetClass', input.assetClass);
        url.searchParams.set('market', market);
        if (input.metroRegion) url.searchParams.set('metroRegion', input.metroRegion);

        const payload = (await fetchJsonWithRetry(
          url.toString(),
          {
            headers: {
              Authorization: `Bearer ${apiKey}`
            },
            cache: 'no-store'
          },
          { fetcher }
        )) as Partial<MarketData>;

        const data: MarketData = {
          metroRegion: normalizeString(payload.metroRegion),
          vacancyPct: normalizeNumber(payload.vacancyPct),
          capRatePct: normalizeNumber(payload.capRatePct),
          rentGrowthPct: normalizeNumber(payload.rentGrowthPct),
          transactionVolumeIndex: normalizeNumber(payload.transactionVolumeIndex),
          marketNotes: normalizeString(payload.marketNotes),
          comparableSetName: normalizeString(payload.comparableSetName),
          comparableSetNotes: normalizeString(payload.comparableSetNotes),
          indicators: Array.isArray(payload.indicators)
            ? payload.indicators
                .map((indicator) => ({
                  indicatorKey: String(indicator.indicatorKey ?? '').trim(),
                  value: normalizeNumber(indicator.value),
                  unit: normalizeString(indicator.unit),
                  observationDate: normalizeString(indicator.observationDate),
                  region: normalizeString(indicator.region)
                }))
                .filter(isNormalizedIndicator)
            : [],
          transactionComps: Array.isArray(payload.transactionComps)
            ? payload.transactionComps
                .map((comp) => ({
                  label: String(comp.label ?? '').trim(),
                  region: String(comp.region ?? '').trim(),
                  comparableType: String(comp.comparableType ?? input.assetClass).trim(),
                  transactionDate: normalizeString(comp.transactionDate),
                  priceKrw: normalizeNumber(comp.priceKrw),
                  pricePerSqmKrw: normalizeNumber(comp.pricePerSqmKrw),
                  pricePerMwKrw: normalizeNumber(comp.pricePerMwKrw),
                  capRatePct: normalizeNumber(comp.capRatePct),
                  buyerType: normalizeString(comp.buyerType),
                  sellerType: normalizeString(comp.sellerType),
                  sourceLink: normalizeString(comp.sourceLink),
                  grossFloorAreaSqm: normalizeNumber(comp.grossFloorAreaSqm)
                }))
                .filter(isNormalizedTransactionComp)
            : [],
          rentComps: Array.isArray(payload.rentComps)
            ? payload.rentComps
                .map((comp) => ({
                  region: String(comp.region ?? '').trim(),
                  comparableType: String(comp.comparableType ?? input.assetClass).trim(),
                  observationDate: normalizeString(comp.observationDate),
                  monthlyRentPerSqmKrw: normalizeNumber(comp.monthlyRentPerSqmKrw),
                  monthlyRatePerKwKrw: normalizeNumber(comp.monthlyRatePerKwKrw),
                  occupancyPct: normalizeNumber(comp.occupancyPct),
                  escalationPct: normalizeNumber(comp.escalationPct),
                  sourceLink: normalizeString(comp.sourceLink)
                }))
                .filter(isNormalizedRentComp)
            : []
        };

        const entry = {
          status: SourceStatus.FRESH,
          payload: data,
          fetchedAt: now,
          expiresAt: new Date(now.getTime() + ttlHours * 60 * 60 * 1000),
          freshnessLabel: 'fresh api'
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
          provenance: [
            {
              field: 'market-api',
              value: data.transactionComps.length + data.rentComps.length,
              sourceSystem,
              mode: 'api',
              fetchedAt: entry.fetchedAt.toISOString(),
              freshnessLabel: entry.freshnessLabel
            }
          ]
        };
      } catch {
        const entry = {
          status: SourceStatus.STALE,
          payload: EMPTY_MARKET_DATA,
          fetchedAt: now,
          expiresAt: new Date(now.getTime() + ttlHours * 60 * 60 * 1000),
          freshnessLabel: 'market feed unavailable'
        };
        await store.upsertCache(sourceSystem, cacheKey, entry);

        return {
          sourceSystem,
          status: SourceStatus.STALE,
          mode: 'fallback',
          fetchedAt: entry.fetchedAt,
          expiresAt: entry.expiresAt,
          freshnessLabel: entry.freshnessLabel,
          data: EMPTY_MARKET_DATA,
          provenance: [
            {
              field: 'market-api',
              value: 0,
              sourceSystem,
              mode: 'fallback',
              fetchedAt: entry.fetchedAt.toISOString(),
              freshnessLabel: entry.freshnessLabel
            }
          ]
        };
      }
    }
  };
}
