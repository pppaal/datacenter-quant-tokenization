import { SourceStatus } from '@prisma/client';
import { fetchJsonWithRetry, type Fetcher } from '@/lib/sources/http';
import type { SourceCacheStore, SourceEnvelope } from '@/lib/sources/types';

export type KoreaPublicDatasetKey =
  | 'kosis'
  | 'bok_ecos'
  | 'reb_property_statistics'
  | 'molit_real_transaction'
  | 'molit_building_ledger'
  | 'molit_building_permit'
  | 'molit_land_use_planning'
  | 'molit_land_characteristics'
  | 'molit_official_land_price'
  | 'korea_cadastral_geometry'
  | 'korea_building_energy';

export type KoreaPublicDatasetDefinition = {
  key: KoreaPublicDatasetKey;
  label: string;
  sourceSystem: string;
  envBaseUrlKey: string;
  envApiKeyKey?: string;
  coverage: string[];
  fallbackNote: string;
};

const datasetDefinitions: Record<KoreaPublicDatasetKey, KoreaPublicDatasetDefinition> = {
  kosis: {
    key: 'kosis',
    label: 'KOSIS',
    sourceSystem: 'korea-kosis-research',
    envBaseUrlKey: 'KOREA_KOSIS_API_URL',
    envApiKeyKey: 'KOREA_KOSIS_API_KEY',
    coverage: ['macro', 'rates', 'construction cost', 'transaction volume'],
    fallbackNote: 'Configured through existing KOSIS series env values or fallback macro data.'
  },
  bok_ecos: {
    key: 'bok_ecos',
    label: 'BOK ECOS',
    sourceSystem: 'korea-bok-ecos',
    envBaseUrlKey: 'KOREA_BOK_ECOS_API_URL',
    envApiKeyKey: 'KOREA_BOK_ECOS_API_KEY',
    coverage: ['rates', 'financial conditions', 'macro'],
    fallbackNote: 'Falls back to cached or manually staged macro observations when ECOS is not configured.'
  },
  reb_property_statistics: {
    key: 'reb_property_statistics',
    label: 'REB Property Statistics',
    sourceSystem: 'korea-reb-property-statistics',
    envBaseUrlKey: 'KOREA_REB_API_URL',
    envApiKeyKey: 'KOREA_REB_API_KEY',
    coverage: ['property market', 'office benchmarks', 'industrial benchmarks'],
    fallbackNote: 'Falls back to market snapshot and existing comp tables when REB is unavailable.'
  },
  molit_real_transaction: {
    key: 'molit_real_transaction',
    label: 'MOLIT Real Transaction API',
    sourceSystem: 'korea-molit-real-transactions',
    envBaseUrlKey: 'KOREA_MOLIT_REAL_TRANSACTION_API_URL',
    envApiKeyKey: 'KOREA_MOLIT_REAL_TRANSACTION_API_KEY',
    coverage: ['transactions', 'price evidence'],
    fallbackNote: 'Falls back to stored transaction comps when MOLIT transactions are unavailable.'
  },
  molit_building_ledger: {
    key: 'molit_building_ledger',
    label: 'MOLIT Building Ledger',
    sourceSystem: 'korea-molit-building-ledger',
    envBaseUrlKey: 'KOREA_MOLIT_BUILDING_LEDGER_API_URL',
    envApiKeyKey: 'KOREA_MOLIT_BUILDING_LEDGER_API_KEY',
    coverage: ['building', 'physical'],
    fallbackNote: 'Falls back to building snapshot and manual intake when the ledger API is unavailable.'
  },
  molit_building_permit: {
    key: 'molit_building_permit',
    label: 'MOLIT Building Permit',
    sourceSystem: 'korea-molit-building-permit',
    envBaseUrlKey: 'KOREA_MOLIT_BUILDING_PERMIT_API_URL',
    envApiKeyKey: 'KOREA_MOLIT_BUILDING_PERMIT_API_KEY',
    coverage: ['permit', 'entitlement'],
    fallbackNote: 'Falls back to permit snapshot and analyst review notes when the permit API is unavailable.'
  },
  molit_land_use_planning: {
    key: 'molit_land_use_planning',
    label: 'MOLIT Land-Use Planning',
    sourceSystem: 'korea-molit-land-use-planning',
    envBaseUrlKey: 'KOREA_MOLIT_LAND_USE_API_URL',
    envApiKeyKey: 'KOREA_MOLIT_LAND_USE_API_KEY',
    coverage: ['planning', 'zoning'],
    fallbackNote: 'Falls back to planning constraints and manual legal review when planning API is unavailable.'
  },
  molit_land_characteristics: {
    key: 'molit_land_characteristics',
    label: 'MOLIT Land Characteristics',
    sourceSystem: 'korea-molit-land-characteristics',
    envBaseUrlKey: 'KOREA_MOLIT_LAND_CHARACTERISTICS_API_URL',
    envApiKeyKey: 'KOREA_MOLIT_LAND_CHARACTERISTICS_API_KEY',
    coverage: ['parcel', 'land'],
    fallbackNote: 'Falls back to parcel intake and geospatial overlays when unavailable.'
  },
  molit_official_land_price: {
    key: 'molit_official_land_price',
    label: 'MOLIT Official Land Price',
    sourceSystem: 'korea-molit-official-land-price',
    envBaseUrlKey: 'KOREA_MOLIT_LAND_PRICE_API_URL',
    envApiKeyKey: 'KOREA_MOLIT_LAND_PRICE_API_KEY',
    coverage: ['land value', 'benchmarking'],
    fallbackNote: 'Falls back to transaction comps and market snapshot when official land price API is unavailable.'
  },
  korea_cadastral_geometry: {
    key: 'korea_cadastral_geometry',
    label: 'Cadastral / Parcel Geometry',
    sourceSystem: 'korea-cadastral-geometry',
    envBaseUrlKey: 'KOREA_CADASTRAL_API_URL',
    envApiKeyKey: 'KOREA_CADASTRAL_API_KEY',
    coverage: ['parcel geometry', 'site'],
    fallbackNote: 'Falls back to normalized address and site profile when cadastral geometry is unavailable.'
  },
  korea_building_energy: {
    key: 'korea_building_energy',
    label: 'Building Energy Registry',
    sourceSystem: 'korea-building-energy',
    envBaseUrlKey: 'KOREA_BUILDING_ENERGY_API_URL',
    envApiKeyKey: 'KOREA_BUILDING_ENERGY_API_KEY',
    coverage: ['energy', 'physical operations'],
    fallbackNote: 'Falls back to energy snapshot and analyst review notes when energy registry is unavailable.'
  }
};

export function listKoreaPublicDatasetDefinitions() {
  return Object.values(datasetDefinitions);
}

export function createKoreaPublicDatasetAdapter(store: SourceCacheStore, fetcher?: Fetcher) {
  return {
    async fetch(datasetKey: KoreaPublicDatasetKey, cacheKey: string, params?: Record<string, string | number | null | undefined>): Promise<SourceEnvelope<Record<string, unknown>>> {
      const definition = datasetDefinitions[datasetKey];
      const sourceSystem = definition.sourceSystem;
      const now = new Date();
      const cached = await store.getFreshCache<Record<string, unknown>>(sourceSystem, cacheKey, now);
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

      const ttlHours = Number(process.env.SOURCE_CACHE_TTL_HOURS ?? 24);
      const fallbackPayload = {
        datasetKey,
        status: 'fallback',
        note: definition.fallbackNote
      };
      const baseUrl = process.env[definition.envBaseUrlKey];

      try {
        if (!baseUrl) throw new Error('missing_endpoint');
        const url = new URL(baseUrl);
        url.searchParams.set('dataset', datasetKey);
        for (const [key, value] of Object.entries(params ?? {})) {
          if (value != null) url.searchParams.set(key, String(value));
        }
        const payload = (await fetchJsonWithRetry(
          url.toString(),
          {
            headers: definition.envApiKeyKey
              ? {
                  Authorization: `Bearer ${process.env[definition.envApiKeyKey] || ''}`
                }
              : undefined,
            cache: 'no-store'
          },
          { fetcher }
        )) as Record<string, unknown>;

        const entry = {
          status: SourceStatus.FRESH,
          payload,
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
          data: payload,
          provenance: Object.keys(payload).map((field) => ({
            field,
            value: typeof payload[field] === 'number' || typeof payload[field] === 'string' ? (payload[field] as string | number) : null,
            sourceSystem,
            mode: 'api',
            fetchedAt: entry.fetchedAt.toISOString(),
            freshnessLabel: entry.freshnessLabel
          }))
        };
      } catch {
        const entry = {
          status: SourceStatus.STALE,
          payload: fallbackPayload,
          fetchedAt: now,
          expiresAt: new Date(now.getTime() + ttlHours * 60 * 60 * 1000),
          freshnessLabel: 'fallback dataset'
        };
        await store.upsertCache(sourceSystem, cacheKey, entry);

        return {
          sourceSystem,
          status: SourceStatus.STALE,
          mode: 'fallback',
          fetchedAt: entry.fetchedAt,
          expiresAt: entry.expiresAt,
          freshnessLabel: entry.freshnessLabel,
          data: fallbackPayload,
          provenance: [
            {
              field: 'note',
              value: definition.fallbackNote,
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
