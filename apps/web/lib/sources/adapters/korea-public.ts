import { AssetClass, SourceStatus } from '@prisma/client';
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
  | 'gis_building_integration'
  | 'korea_building_energy';

export type KoreaPublicDatasetDefinition = {
  key: KoreaPublicDatasetKey;
  label: string;
  sourceSystem: string;
  envBaseUrlKey: string;
  envApiKeyKey?: string;
  coverage: string[];
  fallbackNote: string;
  normalizedMetrics?: KoreaPublicDatasetMetricDefinition[];
};

export type KoreaPublicDatasetMetricDefinition = {
  normalizedKey: string;
  label: string;
  path: string;
  target: 'macro' | 'market';
  unit?: string | null;
  assetClass?: AssetClass | null;
};

export type KoreaPublicNormalizedMetric = {
  normalizedKey: string;
  label: string;
  value: number;
  target: 'macro' | 'market';
  unit: string | null;
  assetClass: AssetClass | null;
};

const officeIndustrialMetricPack: KoreaPublicDatasetMetricDefinition[] = [
  {
    normalizedKey: 'office.vacancy_pct',
    label: 'Office Vacancy',
    path: 'office.vacancyPct',
    target: 'market',
    unit: 'pct',
    assetClass: AssetClass.OFFICE
  },
  {
    normalizedKey: 'office.cap_rate_pct',
    label: 'Office Cap Rate',
    path: 'office.capRatePct',
    target: 'market',
    unit: 'pct',
    assetClass: AssetClass.OFFICE
  },
  {
    normalizedKey: 'office.rent_growth_pct',
    label: 'Office Rent Growth',
    path: 'office.rentGrowthPct',
    target: 'market',
    unit: 'pct',
    assetClass: AssetClass.OFFICE
  },
  {
    normalizedKey: 'industrial.vacancy_pct',
    label: 'Industrial Vacancy',
    path: 'industrial.vacancyPct',
    target: 'market',
    unit: 'pct',
    assetClass: AssetClass.INDUSTRIAL
  },
  {
    normalizedKey: 'industrial.cap_rate_pct',
    label: 'Industrial Cap Rate',
    path: 'industrial.capRatePct',
    target: 'market',
    unit: 'pct',
    assetClass: AssetClass.INDUSTRIAL
  },
  {
    normalizedKey: 'industrial.rent_growth_pct',
    label: 'Industrial Rent Growth',
    path: 'industrial.rentGrowthPct',
    target: 'market',
    unit: 'pct',
    assetClass: AssetClass.INDUSTRIAL
  }
];

const datasetDefinitions: Record<KoreaPublicDatasetKey, KoreaPublicDatasetDefinition> = {
  kosis: {
    key: 'kosis',
    label: 'KOSIS',
    sourceSystem: 'korea-kosis-research',
    envBaseUrlKey: 'KOREA_KOSIS_API_URL',
    envApiKeyKey: 'KOREA_KOSIS_API_KEY',
    coverage: ['macro', 'rates', 'construction cost', 'transaction volume'],
    fallbackNote: 'Configured through existing KOSIS series env values or fallback macro data.',
    normalizedMetrics: [
      {
        normalizedKey: 'kr.cpi_yoy_pct',
        label: 'CPI YoY',
        path: 'cpiYoYPct',
        target: 'macro',
        unit: 'pct'
      },
      {
        normalizedKey: 'kr.unemployment_pct',
        label: 'Unemployment',
        path: 'unemploymentPct',
        target: 'macro',
        unit: 'pct'
      },
      {
        normalizedKey: 'kr.construction_cost_yoy_pct',
        label: 'Construction Cost YoY',
        path: 'constructionCostYoYPct',
        target: 'macro',
        unit: 'pct'
      },
      {
        normalizedKey: 'kr.transaction_volume_index',
        label: 'Transaction Volume Index',
        path: 'transactionVolumeIndex',
        target: 'macro'
      }
    ]
  },
  bok_ecos: {
    key: 'bok_ecos',
    label: 'BOK ECOS',
    sourceSystem: 'korea-bok-ecos',
    envBaseUrlKey: 'KOREA_BOK_ECOS_API_URL',
    envApiKeyKey: 'KOREA_BOK_ECOS_API_KEY',
    coverage: ['rates', 'financial conditions', 'macro'],
    fallbackNote:
      'Falls back to cached or manually staged macro observations when ECOS is not configured.',
    normalizedMetrics: [
      {
        normalizedKey: 'kr.base_rate_pct',
        label: 'Base Rate',
        path: 'baseRatePct',
        target: 'macro',
        unit: 'pct'
      },
      {
        normalizedKey: 'kr.gov_yield_3y_pct',
        label: 'KR 3Y Yield',
        path: 'governmentYield3yPct',
        target: 'macro',
        unit: 'pct'
      },
      {
        normalizedKey: 'kr.gov_yield_10y_pct',
        label: 'KR 10Y Yield',
        path: 'governmentYield10yPct',
        target: 'macro',
        unit: 'pct'
      },
      {
        normalizedKey: 'kr.credit_spread_bps',
        label: 'Credit Spread',
        path: 'creditSpreadBps',
        target: 'macro',
        unit: 'bps'
      }
    ]
  },
  reb_property_statistics: {
    key: 'reb_property_statistics',
    label: 'REB Property Statistics',
    sourceSystem: 'korea-reb-property-statistics',
    envBaseUrlKey: 'KOREA_REB_API_URL',
    envApiKeyKey: 'KOREA_REB_API_KEY',
    coverage: ['property market', 'office benchmarks', 'industrial benchmarks'],
    fallbackNote: 'Falls back to market snapshot and existing comp tables when REB is unavailable.',
    normalizedMetrics: officeIndustrialMetricPack
  },
  molit_real_transaction: {
    key: 'molit_real_transaction',
    label: 'MOLIT Real Transaction API',
    sourceSystem: 'korea-molit-real-transactions',
    envBaseUrlKey: 'KOREA_MOLIT_REAL_TRANSACTION_API_URL',
    envApiKeyKey: 'KOREA_MOLIT_REAL_TRANSACTION_API_KEY',
    coverage: ['transactions', 'price evidence'],
    fallbackNote: 'Falls back to stored transaction comps when MOLIT transactions are unavailable.',
    normalizedMetrics: [
      {
        normalizedKey: 'office.transaction_count',
        label: 'Office Transaction Count',
        path: 'office.transactionCount',
        target: 'market',
        assetClass: AssetClass.OFFICE
      },
      {
        normalizedKey: 'office.median_price_per_sqm_krw',
        label: 'Office Median Price / sqm',
        path: 'office.medianPricePerSqmKrw',
        target: 'market',
        unit: 'krw_per_sqm',
        assetClass: AssetClass.OFFICE
      },
      {
        normalizedKey: 'industrial.transaction_count',
        label: 'Industrial Transaction Count',
        path: 'industrial.transactionCount',
        target: 'market',
        assetClass: AssetClass.INDUSTRIAL
      },
      {
        normalizedKey: 'industrial.median_price_per_sqm_krw',
        label: 'Industrial Median Price / sqm',
        path: 'industrial.medianPricePerSqmKrw',
        target: 'market',
        unit: 'krw_per_sqm',
        assetClass: AssetClass.INDUSTRIAL
      },
      {
        normalizedKey: 'land.transaction_count',
        label: 'Land Transaction Count',
        path: 'land.transactionCount',
        target: 'market',
        assetClass: AssetClass.LAND
      },
      {
        normalizedKey: 'land.median_price_per_sqm_krw',
        label: 'Land Median Price / sqm',
        path: 'land.medianPricePerSqmKrw',
        target: 'market',
        unit: 'krw_per_sqm',
        assetClass: AssetClass.LAND
      }
    ]
  },
  molit_building_ledger: {
    key: 'molit_building_ledger',
    label: 'MOLIT Building Ledger',
    sourceSystem: 'korea-molit-building-ledger',
    envBaseUrlKey: 'KOREA_MOLIT_BUILDING_LEDGER_API_URL',
    envApiKeyKey: 'KOREA_MOLIT_BUILDING_LEDGER_API_KEY',
    coverage: ['building', 'physical'],
    fallbackNote:
      'Falls back to building snapshot and manual intake when the ledger API is unavailable.',
    normalizedMetrics: [
      {
        normalizedKey: 'kr.building_count',
        label: 'Building Count',
        path: 'buildingCount',
        target: 'market'
      },
      {
        normalizedKey: 'kr.avg_gfa_sqm',
        label: 'Average GFA',
        path: 'averageGrossFloorAreaSqm',
        target: 'market',
        unit: 'sqm'
      }
    ]
  },
  molit_building_permit: {
    key: 'molit_building_permit',
    label: 'MOLIT Building Permit',
    sourceSystem: 'korea-molit-building-permit',
    envBaseUrlKey: 'KOREA_MOLIT_BUILDING_PERMIT_API_URL',
    envApiKeyKey: 'KOREA_MOLIT_BUILDING_PERMIT_API_KEY',
    coverage: ['permit', 'entitlement'],
    fallbackNote:
      'Falls back to permit snapshot and analyst review notes when the permit API is unavailable.',
    normalizedMetrics: [
      {
        normalizedKey: 'kr.permit_count',
        label: 'Permit Count',
        path: 'permitCount',
        target: 'market'
      },
      {
        normalizedKey: 'office.permit_area_sqm',
        label: 'Office Permit Area',
        path: 'office.approvedFloorAreaSqm',
        target: 'market',
        unit: 'sqm',
        assetClass: AssetClass.OFFICE
      },
      {
        normalizedKey: 'industrial.permit_area_sqm',
        label: 'Industrial Permit Area',
        path: 'industrial.approvedFloorAreaSqm',
        target: 'market',
        unit: 'sqm',
        assetClass: AssetClass.INDUSTRIAL
      }
    ]
  },
  molit_land_use_planning: {
    key: 'molit_land_use_planning',
    label: 'MOLIT Land-Use Planning',
    sourceSystem: 'korea-molit-land-use-planning',
    envBaseUrlKey: 'KOREA_MOLIT_LAND_USE_API_URL',
    envApiKeyKey: 'KOREA_MOLIT_LAND_USE_API_KEY',
    coverage: ['planning', 'zoning'],
    fallbackNote:
      'Falls back to planning constraints and manual legal review when planning API is unavailable.',
    normalizedMetrics: [
      {
        normalizedKey: 'kr.planning_restriction_count',
        label: 'Planning Restrictions',
        path: 'planningRestrictionCount',
        target: 'market'
      },
      {
        normalizedKey: 'land.entitlement_complexity_index',
        label: 'Land Entitlement Complexity',
        path: 'land.entitlementComplexityIndex',
        target: 'market',
        assetClass: AssetClass.LAND
      }
    ]
  },
  molit_land_characteristics: {
    key: 'molit_land_characteristics',
    label: 'MOLIT Land Characteristics',
    sourceSystem: 'korea-molit-land-characteristics',
    envBaseUrlKey: 'KOREA_MOLIT_LAND_CHARACTERISTICS_API_URL',
    envApiKeyKey: 'KOREA_MOLIT_LAND_CHARACTERISTICS_API_KEY',
    coverage: ['parcel', 'land'],
    fallbackNote: 'Falls back to parcel intake and geospatial overlays when unavailable.',
    normalizedMetrics: [
      {
        normalizedKey: 'land.avg_site_area_sqm',
        label: 'Average Site Area',
        path: 'land.averageSiteAreaSqm',
        target: 'market',
        unit: 'sqm',
        assetClass: AssetClass.LAND
      },
      {
        normalizedKey: 'land.developable_ratio_pct',
        label: 'Developable Ratio',
        path: 'land.developableRatioPct',
        target: 'market',
        unit: 'pct',
        assetClass: AssetClass.LAND
      }
    ]
  },
  molit_official_land_price: {
    key: 'molit_official_land_price',
    label: 'MOLIT Official Land Price',
    sourceSystem: 'korea-molit-official-land-price',
    envBaseUrlKey: 'KOREA_MOLIT_LAND_PRICE_API_URL',
    envApiKeyKey: 'KOREA_MOLIT_LAND_PRICE_API_KEY',
    coverage: ['land value', 'benchmarking'],
    fallbackNote:
      'Falls back to transaction comps and market snapshot when official land price API is unavailable.',
    normalizedMetrics: [
      {
        normalizedKey: 'land.official_land_price_per_sqm_krw',
        label: 'Official Land Price / sqm',
        path: 'land.officialLandPricePerSqmKrw',
        target: 'market',
        unit: 'krw_per_sqm',
        assetClass: AssetClass.LAND
      },
      {
        normalizedKey: 'office.land_price_per_sqm_krw',
        label: 'Office Land Price / sqm',
        path: 'office.officialLandPricePerSqmKrw',
        target: 'market',
        unit: 'krw_per_sqm',
        assetClass: AssetClass.OFFICE
      },
      {
        normalizedKey: 'industrial.land_price_per_sqm_krw',
        label: 'Industrial Land Price / sqm',
        path: 'industrial.officialLandPricePerSqmKrw',
        target: 'market',
        unit: 'krw_per_sqm',
        assetClass: AssetClass.INDUSTRIAL
      }
    ]
  },
  korea_cadastral_geometry: {
    key: 'korea_cadastral_geometry',
    label: 'Cadastral / Parcel Geometry',
    sourceSystem: 'korea-cadastral-geometry',
    envBaseUrlKey: 'KOREA_CADASTRAL_API_URL',
    envApiKeyKey: 'KOREA_CADASTRAL_API_KEY',
    coverage: ['parcel geometry', 'site'],
    fallbackNote:
      'Falls back to normalized address and site profile when cadastral geometry is unavailable.',
    normalizedMetrics: [
      {
        normalizedKey: 'kr.parcel_count',
        label: 'Mapped Parcels',
        path: 'parcelCount',
        target: 'market'
      },
      {
        normalizedKey: 'kr.cadastral_area_sqm',
        label: 'Mapped Parcel Area',
        path: 'mappedAreaSqm',
        target: 'market',
        unit: 'sqm'
      }
    ]
  },
  gis_building_integration: {
    key: 'gis_building_integration',
    label: 'GIS Building Integration',
    sourceSystem: 'korea-gis-building-integration',
    envBaseUrlKey: 'KOREA_GIS_BUILDING_API_URL',
    envApiKeyKey: 'KOREA_GIS_BUILDING_API_KEY',
    coverage: ['building geometry', 'parcel overlays', 'site context'],
    fallbackNote:
      'Falls back to building snapshot, address normalization, and geospatial overlays when GIS building integration is unavailable.',
    normalizedMetrics: [
      {
        normalizedKey: 'kr.gis_building_count',
        label: 'GIS Buildings',
        path: 'buildingCount',
        target: 'market'
      },
      {
        normalizedKey: 'kr.gis_overlay_coverage_pct',
        label: 'GIS Overlay Coverage',
        path: 'overlayCoveragePct',
        target: 'market',
        unit: 'pct'
      }
    ]
  },
  korea_building_energy: {
    key: 'korea_building_energy',
    label: 'Building Energy Registry',
    sourceSystem: 'korea-building-energy',
    envBaseUrlKey: 'KOREA_BUILDING_ENERGY_API_URL',
    envApiKeyKey: 'KOREA_BUILDING_ENERGY_API_KEY',
    coverage: ['energy', 'physical operations'],
    fallbackNote:
      'Falls back to energy snapshot and analyst review notes when energy registry is unavailable.',
    normalizedMetrics: [
      {
        normalizedKey: 'kr.energy_use_intensity_kwh_sqm',
        label: 'Energy Use Intensity',
        path: 'averageEnergyUseIntensityKwhPerSqm',
        target: 'market',
        unit: 'kwh_per_sqm'
      },
      {
        normalizedKey: 'kr.green_certified_building_pct',
        label: 'Green Certified Building Share',
        path: 'greenCertifiedBuildingPct',
        target: 'market',
        unit: 'pct'
      }
    ]
  }
};

export function listKoreaPublicDatasetDefinitions() {
  return Object.values(datasetDefinitions);
}

function getValueAtPath(payload: Record<string, unknown>, path: string) {
  const segments = path.split('.');
  let current: unknown = payload;

  for (const segment of segments) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return null;
    }
    current = (current as Record<string, unknown>)[segment];
  }

  return current ?? null;
}

function coerceNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

export function extractKoreaPublicDatasetMetrics(
  definition: KoreaPublicDatasetDefinition,
  payload: Record<string, unknown>
): KoreaPublicNormalizedMetric[] {
  return (definition.normalizedMetrics ?? []).flatMap((metric) => {
    const value = coerceNumber(getValueAtPath(payload, metric.path));
    if (value == null) {
      return [];
    }

    return [
      {
        normalizedKey: metric.normalizedKey,
        label: metric.label,
        value,
        target: metric.target,
        unit: metric.unit ?? null,
        assetClass: metric.assetClass ?? null
      }
    ];
  });
}

export function createKoreaPublicDatasetAdapter(store: SourceCacheStore, fetcher?: Fetcher) {
  return {
    async fetch(
      datasetKey: KoreaPublicDatasetKey,
      cacheKey: string,
      params?: Record<string, string | number | null | undefined>
    ): Promise<SourceEnvelope<Record<string, unknown>>> {
      const definition = datasetDefinitions[datasetKey];
      const sourceSystem = definition.sourceSystem;
      const now = new Date();
      const cached = await store.getFreshCache<Record<string, unknown>>(
        sourceSystem,
        cacheKey,
        now
      );
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
            value:
              typeof payload[field] === 'number' || typeof payload[field] === 'string'
                ? (payload[field] as string | number)
                : null,
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
