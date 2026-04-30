/**
 * Cross-market adapter scaffold for Japan + Hong Kong.
 *
 * The Korean public adapter (korea-public.ts) drains KOSIS / BOK / REB /
 * MOLIT through 12 dataset definitions. For CBRE-style cross-market
 * comparison ("Korea office is 40bps below Tokyo") we need analogous
 * Japan + Hong Kong data behind the same MarketIndicatorSeries /
 * MacroSeries shape so the dashboards downstream don't need
 * market-specific rendering paths.
 *
 * What this module ships:
 *   - 6 dataset definitions (BOJ rates, JP REIT office cap rate,
 *     JLL JP Industrial cap rate, HKMA rates, JLL HK Office,
 *     HK industrial benchmarks)
 *   - createCrossMarketAdapter(store, fetcher?) factory mirroring the
 *     KoreaPublicDatasetAdapter shape so syncOfficialSourceResearch can
 *     wire it in with a single import.
 *   - Fallback envelopes when env keys are missing — a SOURCE row still
 *     surfaces in the workspace with a "needs configuration" freshness
 *     label so operators know to either set the API key or use
 *     /admin/research/timeseries-import to manually fill the series.
 *
 * What this module does NOT ship (needs real API keys to test):
 *   - Authoritative live fetching against BOJ ECOS-equivalent or HKMA
 *     monthly stats. The httpFetch path is wired for both, but the
 *     parameter shapes vary by API and need real-data calibration.
 *   - Historical backfill — the recommended path is to use the
 *     timeseries-import CSV admin tool for 5-year history.
 */
import { AssetClass, SourceStatus } from '@prisma/client';
import { fetchJsonWithRetry, type Fetcher } from '@/lib/sources/http';
import type { SourceCacheStore, SourceEnvelope } from '@/lib/sources/types';

const CACHE_TTL_HOURS_DEFAULT = 12;

export type CrossMarketPayload = {
  market: 'JP' | 'HK';
  expectedSeries: string[];
  needsConfiguration: boolean;
  fallbackNote: string;
};

export type CrossMarketDatasetKey =
  | 'boj_rates'
  | 'jp_reit_office_cap'
  | 'jp_industrial_cap'
  | 'hkma_rates'
  | 'hk_office_cap'
  | 'hk_industrial_cap';

export type CrossMarketCadence = 'macro' | 'market';

export type CrossMarketDatasetDefinition = {
  key: CrossMarketDatasetKey;
  label: string;
  market: 'JP' | 'HK';
  sourceSystem: string;
  envBaseUrlKey: string;
  envApiKeyKey?: string;
  cadence: CrossMarketCadence;
  fallbackNote: string;
  assetClass?: AssetClass;
  /** Series the operator is expected to track for this dataset. */
  expectedSeries: string[];
};

const DATASETS: Record<CrossMarketDatasetKey, CrossMarketDatasetDefinition> = {
  boj_rates: {
    key: 'boj_rates',
    label: 'BOJ Time-Series Database',
    market: 'JP',
    sourceSystem: 'jp-boj-tsdb',
    envBaseUrlKey: 'JP_BOJ_API_URL',
    envApiKeyKey: 'JP_BOJ_API_KEY',
    cadence: 'macro',
    fallbackNote:
      'Falls back to manual CSV ingestion via /admin/research/timeseries-import when JP_BOJ_API_URL is not configured.',
    expectedSeries: [
      'jp.policy_rate_pct',
      'jp.gov_yield_10y_pct',
      'jp.cpi_yoy_pct',
      'jp.gdp_yoy_pct'
    ]
  },
  jp_reit_office_cap: {
    key: 'jp_reit_office_cap',
    label: 'JP REIT Office Cap Rate',
    market: 'JP',
    sourceSystem: 'jp-reit-office',
    envBaseUrlKey: 'JP_REIT_API_URL',
    cadence: 'market',
    assetClass: AssetClass.OFFICE,
    fallbackNote:
      'Falls back to manual CSV import. Tier breakdown (Otemachi Prime / Marunouchi Grade A / etc.) needs operator-supplied submarket × tier rows.',
    expectedSeries: ['jp.office.cap_rate_pct', 'jp.office.vacancy_pct', 'jp.office.rent_growth_pct']
  },
  jp_industrial_cap: {
    key: 'jp_industrial_cap',
    label: 'JP Industrial / Logistics Cap Rate',
    market: 'JP',
    sourceSystem: 'jp-industrial',
    envBaseUrlKey: 'JP_INDUSTRIAL_API_URL',
    cadence: 'market',
    assetClass: AssetClass.INDUSTRIAL,
    fallbackNote:
      'Falls back to manual CSV import. Premium logistics in Greater Tokyo distinct from Standard outer ring.',
    expectedSeries: ['jp.industrial.cap_rate_pct', 'jp.industrial.vacancy_pct']
  },
  hkma_rates: {
    key: 'hkma_rates',
    label: 'HKMA Monthly Statistics',
    market: 'HK',
    sourceSystem: 'hk-hkma',
    envBaseUrlKey: 'HK_HKMA_API_URL',
    cadence: 'macro',
    fallbackNote:
      'HKMA publishes HIBOR + base rate via api.hkma.gov.hk; envelope here falls back to manual CSV when the URL is not set.',
    expectedSeries: ['hk.base_rate_pct', 'hk.hibor_3m_pct', 'hk.cpi_yoy_pct']
  },
  hk_office_cap: {
    key: 'hk_office_cap',
    label: 'HK Office Cap Rate',
    market: 'HK',
    sourceSystem: 'hk-office',
    envBaseUrlKey: 'HK_OFFICE_API_URL',
    cadence: 'market',
    assetClass: AssetClass.OFFICE,
    fallbackNote:
      'Falls back to manual CSV import. Central / Admiralty Prime distinct from Kowloon Grade A / Strata.',
    expectedSeries: ['hk.office.cap_rate_pct', 'hk.office.vacancy_pct']
  },
  hk_industrial_cap: {
    key: 'hk_industrial_cap',
    label: 'HK Industrial Cap Rate',
    market: 'HK',
    sourceSystem: 'hk-industrial',
    envBaseUrlKey: 'HK_INDUSTRIAL_API_URL',
    cadence: 'market',
    assetClass: AssetClass.INDUSTRIAL,
    fallbackNote: 'Falls back to manual CSV import. Tsuen Wan / Kwai Chung / NT logistics tiers.',
    expectedSeries: ['hk.industrial.cap_rate_pct']
  }
};

export function listCrossMarketDatasetDefinitions(): CrossMarketDatasetDefinition[] {
  return Object.values(DATASETS);
}

export function listCrossMarketDatasetDefinitionsByMarket(
  market: 'JP' | 'HK'
): CrossMarketDatasetDefinition[] {
  return Object.values(DATASETS).filter((d) => d.market === market);
}

export type CrossMarketFetchEnvelope = SourceEnvelope<CrossMarketPayload>;

/**
 * Adapter factory. Mirrors the createKoreaPublicDatasetAdapter shape so
 * syncOfficialSourceResearch can iterate cross-market datasets with the
 * same loop body. The fetch implementation is intentionally minimal:
 * when the env URL is set it issues a single GET via fetchJsonWithRetry
 * (so the safeFetch + retry plumbing applies); when the URL is missing
 * the envelope returns `needsConfiguration: true` with a MANUAL source
 * status so the workspace surfaces a clear "configure or use CSV
 * import" coverage task.
 */
export function createCrossMarketAdapter(store: SourceCacheStore, fetcher?: Fetcher) {
  return {
    async fetch(
      datasetKey: CrossMarketDatasetKey,
      cacheKey: string
    ): Promise<CrossMarketFetchEnvelope> {
      const definition = DATASETS[datasetKey];
      const sourceSystem = definition.sourceSystem;
      const baseUrl = process.env[definition.envBaseUrlKey]?.trim();
      const ttlHours = Number(process.env.SOURCE_CACHE_TTL_HOURS ?? CACHE_TTL_HOURS_DEFAULT);
      const now = new Date();

      const cached = await store.getFreshCache<CrossMarketPayload>(sourceSystem, cacheKey, now);
      if (cached) {
        return {
          sourceSystem,
          status: cached.status,
          mode: 'cache',
          fetchedAt: cached.fetchedAt,
          expiresAt: cached.expiresAt,
          freshnessLabel: cached.freshnessLabel,
          data: cached.payload,
          provenance: []
        };
      }

      const buildEnvelope = (
        status: SourceStatus,
        mode: 'api' | 'fallback' | 'manual',
        freshnessLabel: string,
        needsConfiguration: boolean
      ): CrossMarketFetchEnvelope => {
        const expiresAt = new Date(now.getTime() + ttlHours * 60 * 60 * 1000);
        const payload: CrossMarketPayload = {
          market: definition.market,
          expectedSeries: definition.expectedSeries,
          needsConfiguration,
          fallbackNote: definition.fallbackNote
        };
        return {
          sourceSystem,
          status,
          mode,
          fetchedAt: now,
          expiresAt,
          freshnessLabel,
          data: payload,
          provenance: [
            {
              field: 'configuration',
              value: definition.envBaseUrlKey,
              sourceSystem,
              mode,
              fetchedAt: now.toISOString(),
              freshnessLabel
            }
          ]
        };
      };

      const persistCache = async (envelope: CrossMarketFetchEnvelope) => {
        await store.upsertCache(sourceSystem, cacheKey, {
          status: envelope.status,
          payload: envelope.data,
          fetchedAt: envelope.fetchedAt,
          expiresAt: envelope.expiresAt,
          freshnessLabel: envelope.freshnessLabel
        });
      };

      if (!baseUrl) {
        const envelope = buildEnvelope(
          SourceStatus.MANUAL,
          'manual',
          `${definition.envBaseUrlKey} not configured · CSV-import path`,
          true
        );
        await persistCache(envelope);
        return envelope;
      }

      // Live path: a thin probe for "is the upstream reachable" — this
      // is intentionally simple. Real fetching against BOJ / HKMA
      // requires per-API param handling that lives outside the scaffold.
      try {
        const probe = await fetchJsonWithRetry(baseUrl, undefined, { fetcher });
        const reachable = probe !== null && probe !== undefined;
        const envelope = buildEnvelope(
          reachable ? SourceStatus.FRESH : SourceStatus.STALE,
          reachable ? 'api' : 'fallback',
          reachable ? 'Reachable; per-series wiring TODO' : 'Probe failed; re-run after API auth',
          !reachable
        );
        await persistCache(envelope);
        return envelope;
      } catch (error) {
        const envelope = buildEnvelope(
          SourceStatus.FAILED,
          'fallback',
          `Probe error: ${error instanceof Error ? error.message : 'unknown'}`,
          true
        );
        await persistCache(envelope);
        return envelope;
      }
    }
  };
}
