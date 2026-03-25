import { SourceStatus } from '@prisma/client';
import { getDefaultFxRateToKrw, type SupportedCurrency } from '@/lib/finance/currency';
import { fetchJsonWithRetry, type Fetcher } from '@/lib/sources/http';
import type { SourceCacheStore, SourceEnvelope } from '@/lib/sources/types';

export type FxRateData = {
  fromCurrency: SupportedCurrency;
  toCurrency: 'KRW';
  rateToKrw: number;
  asOf: string | null;
  provider: string;
};

function extractRateToKrw(payload: unknown) {
  if (!payload || typeof payload !== 'object') return null;

  const record = payload as Record<string, unknown>;

  const directRate = Number(record.rateToKrw ?? record.rate ?? record.result);
  if (Number.isFinite(directRate) && directRate > 0) return directRate;

  const rates = record.rates;
  if (rates && typeof rates === 'object') {
    const rate = Number((rates as Record<string, unknown>).KRW);
    if (Number.isFinite(rate) && rate > 0) return rate;
  }

  const conversionRates = record.conversion_rates;
  if (conversionRates && typeof conversionRates === 'object') {
    const rate = Number((conversionRates as Record<string, unknown>).KRW);
    if (Number.isFinite(rate) && rate > 0) return rate;
  }

  return null;
}

function extractAsOf(payload: unknown) {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as Record<string, unknown>;
  const raw = record.date ?? record.time_last_update_utc ?? record.timestamp ?? null;
  return typeof raw === 'string' ? raw : raw instanceof Date ? raw.toISOString() : null;
}

export function createFxAdapter(store: SourceCacheStore, fetcher?: Fetcher) {
  return {
    async fetch(currency: SupportedCurrency): Promise<SourceEnvelope<FxRateData>> {
      const sourceSystem = 'global-fx-rates';
      const cacheKey = `${currency}:KRW`;
      const now = new Date();
      const ttlMinutes = Number(process.env.FX_SOURCE_CACHE_TTL_MINUTES ?? 360);
      const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000);

      if (currency === 'KRW') {
        const data: FxRateData = {
          fromCurrency: 'KRW',
          toCurrency: 'KRW',
          rateToKrw: 1,
          asOf: now.toISOString(),
          provider: 'identity'
        };

        return {
          sourceSystem,
          status: SourceStatus.FRESH,
          mode: 'manual',
          fetchedAt: now,
          expiresAt,
          freshnessLabel: 'identity rate',
          data,
          provenance: [
            {
              field: 'rateToKrw',
              value: 1,
              sourceSystem,
              mode: 'manual',
              fetchedAt: now.toISOString(),
              freshnessLabel: 'identity rate'
            }
          ]
        };
      }

      const override = await store.getOverride<FxRateData>(sourceSystem, cacheKey);
      if (override?.rateToKrw && Number.isFinite(override.rateToKrw) && override.rateToKrw > 0) {
        return {
          sourceSystem,
          status: SourceStatus.FRESH,
          mode: 'manual',
          fetchedAt: now,
          expiresAt,
          freshnessLabel: 'manual override',
          data: override,
          provenance: [
            {
              field: 'rateToKrw',
              value: override.rateToKrw,
              sourceSystem,
              mode: 'manual',
              fetchedAt: now.toISOString(),
              freshnessLabel: 'manual override'
            }
          ]
        };
      }

      const cached = await store.getFreshCache<FxRateData>(sourceSystem, cacheKey, now);
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
              field: 'rateToKrw',
              value: cached.payload.rateToKrw,
              sourceSystem,
              mode: 'cache',
              fetchedAt: cached.fetchedAt.toISOString(),
              freshnessLabel: cached.freshnessLabel
            }
          ]
        };
      }

      const customFxApiUrl = process.env.GLOBAL_FX_API_URL;
      const customFxApiKey = process.env.GLOBAL_FX_API_KEY;
      const fallbackRate = getDefaultFxRateToKrw(currency);

      try {
        const url = customFxApiUrl
          ? new URL(customFxApiUrl)
          : new URL('https://api.frankfurter.app/latest');

        if (customFxApiUrl) {
          url.searchParams.set('from', currency);
          url.searchParams.set('to', 'KRW');
          url.searchParams.set('base', currency);
          url.searchParams.set('symbols', 'KRW');
        } else {
          url.searchParams.set('from', currency);
          url.searchParams.set('to', 'KRW');
        }

        const payload = await fetchJsonWithRetry(
          url.toString(),
          {
            cache: 'no-store',
            headers: customFxApiKey
              ? {
                  Authorization: `Bearer ${customFxApiKey}`
                }
              : undefined
          },
          { fetcher }
        );

        const rateToKrw = extractRateToKrw(payload);
        if (!rateToKrw) {
          throw new Error('missing_fx_rate');
        }

        const data: FxRateData = {
          fromCurrency: currency,
          toCurrency: 'KRW',
          rateToKrw,
          asOf: extractAsOf(payload),
          provider: customFxApiUrl ? 'custom-fx-api' : 'frankfurter'
        };

        await store.upsertCache(sourceSystem, cacheKey, {
          status: SourceStatus.FRESH,
          payload: data,
          fetchedAt: now,
          expiresAt,
          freshnessLabel: 'fresh api'
        });

        return {
          sourceSystem,
          status: SourceStatus.FRESH,
          mode: 'api',
          fetchedAt: now,
          expiresAt,
          freshnessLabel: 'fresh api',
          data,
          provenance: [
            {
              field: 'rateToKrw',
              value: rateToKrw,
              sourceSystem,
              mode: 'api',
              fetchedAt: now.toISOString(),
              freshnessLabel: 'fresh api'
            }
          ]
        };
      } catch {
        const data: FxRateData = {
          fromCurrency: currency,
          toCurrency: 'KRW',
          rateToKrw: fallbackRate,
          asOf: null,
          provider: 'fallback'
        };

        await store.upsertCache(sourceSystem, cacheKey, {
          status: SourceStatus.STALE,
          payload: data,
          fetchedAt: now,
          expiresAt,
          freshnessLabel: 'fallback dataset'
        });

        return {
          sourceSystem,
          status: SourceStatus.STALE,
          mode: 'fallback',
          fetchedAt: now,
          expiresAt,
          freshnessLabel: 'fallback dataset',
          data,
          provenance: [
            {
              field: 'rateToKrw',
              value: fallbackRate,
              sourceSystem,
              mode: 'fallback',
              fetchedAt: now.toISOString(),
              freshnessLabel: 'fallback dataset'
            }
          ]
        };
      }
    }
  };
}
