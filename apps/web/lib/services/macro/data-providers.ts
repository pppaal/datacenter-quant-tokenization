// ---------------------------------------------------------------------------
// External macro data provider integrations
// ---------------------------------------------------------------------------
// BOK (Bank of Korea) ECOS API and US FRED API.
// These fetch real-time macro series data to replace seed/hardcoded values.

import { safeFetch } from '@/lib/security/safe-fetch';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MacroDataPoint = {
  seriesKey: string;
  label: string;
  value: number;
  unit: string;
  observationDate: Date;
  sourceSystem: string;
};

export type DataProviderResult = {
  provider: string;
  market: string;
  points: MacroDataPoint[];
  fetchedAt: Date;
  error: string | null;
};

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const REQUEST_TIMEOUT_MS = 15_000;

function getBokApiKey(): string | null {
  return process.env.BOK_ECOS_API_KEY ?? null;
}

function getFredApiKey(): string | null {
  return process.env.FRED_API_KEY ?? null;
}

export function isBokConfigured(): boolean {
  return getBokApiKey() !== null;
}

export function isFredConfigured(): boolean {
  return getFredApiKey() !== null;
}

// ---------------------------------------------------------------------------
// BOK ECOS API — Bank of Korea
// ---------------------------------------------------------------------------
// API docs: https://ecos.bok.or.kr/api/
// Base rate: stat code 722Y001, item code 0101000
// CPI: stat code 901Y009
// Credit spread proxy: stat code 721Y001

type BokSeriesMapping = {
  statCode: string;
  itemCode: string;
  seriesKey: string;
  label: string;
  unit: string;
  transform?: (value: number) => number;
};

const BOK_SERIES_MAPPINGS: BokSeriesMapping[] = [
  {
    statCode: '722Y001',
    itemCode: '0101000',
    seriesKey: 'policy_rate_pct',
    label: 'BOK Base Rate',
    unit: '%'
  },
  {
    statCode: '901Y009',
    itemCode: '0',
    seriesKey: 'inflation_pct',
    label: 'CPI YoY',
    unit: '%'
  },
  {
    statCode: '721Y001',
    itemCode: '1010000',
    seriesKey: 'debt_cost_pct',
    label: 'Corporate Bond Yield (AA-)',
    unit: '%'
  },
  {
    statCode: '721Y001',
    itemCode: '1030000',
    seriesKey: 'credit_spread_bps',
    label: 'Credit Spread (AA- minus Treasury)',
    unit: 'bps',
    transform: (value: number) => value * 100 // Convert pct to bps
  }
];

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  // Routes through safeFetch so an attacker can't redirect a vendor URL to
  // an internal target (BOK / FRED responses include redirects on auth
  // failure that we previously followed unconditionally).
  return safeFetch(url, { timeoutMs });
}

export async function fetchBokData(months = 12): Promise<DataProviderResult> {
  const apiKey = getBokApiKey();
  if (!apiKey) {
    return {
      provider: 'bok-ecos',
      market: 'KR',
      points: [],
      fetchedAt: new Date(),
      error: 'BOK_ECOS_API_KEY not configured'
    };
  }

  const endDate = new Date();
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - months);
  const startYm = `${startDate.getFullYear()}${String(startDate.getMonth() + 1).padStart(2, '0')}`;
  const endYm = `${endDate.getFullYear()}${String(endDate.getMonth() + 1).padStart(2, '0')}`;

  const points: MacroDataPoint[] = [];
  const errors: string[] = [];

  for (const mapping of BOK_SERIES_MAPPINGS) {
    try {
      const url = `https://ecos.bok.or.kr/api/StatisticSearch/${apiKey}/json/kr/1/100/${mapping.statCode}/M/${startYm}/${endYm}/${mapping.itemCode}`;
      const response = await fetchWithTimeout(url, REQUEST_TIMEOUT_MS);

      if (!response.ok) {
        errors.push(`BOK ${mapping.seriesKey}: HTTP ${response.status}`);
        continue;
      }

      const data = (await response.json()) as {
        StatisticSearch?: {
          row?: Array<{
            TIME: string;
            DATA_VALUE: string;
          }>;
        };
      };

      const rows = data.StatisticSearch?.row ?? [];
      for (const row of rows) {
        const value = parseFloat(row.DATA_VALUE);
        if (isNaN(value)) continue;

        const year = parseInt(row.TIME.slice(0, 4));
        const month = parseInt(row.TIME.slice(4, 6)) - 1;

        points.push({
          seriesKey: mapping.seriesKey,
          label: mapping.label,
          value: mapping.transform ? mapping.transform(value) : value,
          unit: mapping.unit,
          observationDate: new Date(Date.UTC(year, month, 1)),
          sourceSystem: 'bok-ecos'
        });
      }
    } catch (err) {
      errors.push(
        `BOK ${mapping.seriesKey}: ${err instanceof Error ? err.message : 'unknown error'}`
      );
    }
  }

  return {
    provider: 'bok-ecos',
    market: 'KR',
    points,
    fetchedAt: new Date(),
    error: errors.length > 0 ? errors.join('; ') : null
  };
}

// ---------------------------------------------------------------------------
// FRED API — Federal Reserve Economic Data
// ---------------------------------------------------------------------------
// API docs: https://fred.stlouisfed.org/docs/api/
// Fed Funds: FEDFUNDS
// CPI: CPIAUCSL (transform to YoY)
// 10Y Treasury: DGS10
// BBB Spread: BAMLC0A4CBBB
// Construction Cost: WPUSI012011 (PPI Construction)

type FredSeriesMapping = {
  fredId: string;
  seriesKey: string;
  label: string;
  unit: string;
  transform?: (value: number) => number;
};

const FRED_SERIES_MAPPINGS: FredSeriesMapping[] = [
  {
    fredId: 'FEDFUNDS',
    seriesKey: 'policy_rate_pct',
    label: 'Fed Funds Rate',
    unit: '%'
  },
  {
    fredId: 'DGS10',
    seriesKey: 'discount_rate_pct',
    label: '10Y Treasury Yield',
    unit: '%'
  },
  {
    fredId: 'BAMLC0A4CBBB',
    seriesKey: 'credit_spread_bps',
    label: 'BBB Corporate Spread',
    unit: 'bps',
    transform: (value: number) => value * 100
  }
];

export async function fetchFredData(months = 12): Promise<DataProviderResult> {
  const apiKey = getFredApiKey();
  if (!apiKey) {
    return {
      provider: 'fred',
      market: 'US',
      points: [],
      fetchedAt: new Date(),
      error: 'FRED_API_KEY not configured'
    };
  }

  const endDate = new Date();
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - months);
  const startStr = startDate.toISOString().slice(0, 10);
  const endStr = endDate.toISOString().slice(0, 10);

  const points: MacroDataPoint[] = [];
  const errors: string[] = [];

  for (const mapping of FRED_SERIES_MAPPINGS) {
    try {
      const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${mapping.fredId}&api_key=${apiKey}&file_type=json&observation_start=${startStr}&observation_end=${endStr}&frequency=m`;
      const response = await fetchWithTimeout(url, REQUEST_TIMEOUT_MS);

      if (!response.ok) {
        errors.push(`FRED ${mapping.fredId}: HTTP ${response.status}`);
        continue;
      }

      const data = (await response.json()) as {
        observations?: Array<{
          date: string;
          value: string;
        }>;
      };

      for (const obs of data.observations ?? []) {
        const value = parseFloat(obs.value);
        if (isNaN(value)) continue;

        points.push({
          seriesKey: mapping.seriesKey,
          label: mapping.label,
          value: mapping.transform ? mapping.transform(value) : value,
          unit: mapping.unit,
          observationDate: new Date(obs.date + 'T00:00:00.000Z'),
          sourceSystem: 'fred'
        });
      }
    } catch (err) {
      errors.push(
        `FRED ${mapping.fredId}: ${err instanceof Error ? err.message : 'unknown error'}`
      );
    }
  }

  return {
    provider: 'fred',
    market: 'US',
    points,
    fetchedAt: new Date(),
    error: errors.length > 0 ? errors.join('; ') : null
  };
}

// ---------------------------------------------------------------------------
// Unified fetch
// ---------------------------------------------------------------------------

export async function fetchAllMacroData(months = 12): Promise<DataProviderResult[]> {
  const results: DataProviderResult[] = [];

  const [bokResult, fredResult] = await Promise.allSettled([
    isBokConfigured() ? fetchBokData(months) : Promise.resolve(null),
    isFredConfigured() ? fetchFredData(months) : Promise.resolve(null)
  ]);

  if (bokResult.status === 'fulfilled' && bokResult.value) {
    results.push(bokResult.value);
  }
  if (fredResult.status === 'fulfilled' && fredResult.value) {
    results.push(fredResult.value);
  }

  return results;
}

export function getConfiguredProviders(): string[] {
  const providers: string[] = [];
  if (isBokConfigured()) providers.push('bok-ecos');
  if (isFredConfigured()) providers.push('fred');
  return providers;
}
