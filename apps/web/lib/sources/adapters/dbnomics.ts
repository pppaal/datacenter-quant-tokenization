/**
 * DBnomics worldwide macro connector.
 *
 * DBnomics (https://db.nomics.world) is an open-source, KEYLESS aggregator that
 * unifies ~61 macro providers (World Bank, IMF, OECD, BIS, ECB, Eurostat, FRED,
 * national statistics offices…) behind one hierarchical API:
 *
 *     Provider > Dataset > Series
 *
 * The JSON series endpoint is, e.g.:
 *     GET https://api.db.nomics.world/v22/series/{provider}/{dataset}/{series_code}?observations=1
 *
 * The response carries `series.docs[]`, each doc holding aligned `period[]` and
 * `value[]` arrays (oldest-first). We take the NEWEST non-null observation per
 * series. DBnomics merely RELAYS upstream providers, so each emitted point keeps
 * both the canonical `sourceSystem` ("dbnomics") and the relayed `provider`
 * (e.g. "BIS", "IMF") so attribution survives downstream.
 *
 * Live-vs-fallback decision (matches lib/sources/adapters/world-bank.ts):
 *   - DBnomics needs no key, so live fetching is gated on an explicit enable
 *     flag `ENABLE_DBNOMICS_MACRO` (default off, like ENABLE_WORLD_BANK_MACRO)
 *     so CI/dev stay network-free. When unset, `fetchDbnomicsSeries` returns an
 *     empty result with a "not enabled" note — it NEVER throws into callers.
 *   - On any per-series failure/timeout we log a warning and skip that series;
 *     a single bad series never sinks the whole result.
 *
 * SCAFFOLD-PARITY NOTE (matches world-bank.ts / cross-market.ts disclaimers):
 *   The default basket of series codes below is wired against the documented
 *   DBnomics provider/dataset/series shape, but the EXACT series codes MUST be
 *   validated against a live sample before the values are treated as
 *   authoritative. Provider datasets are periodically revised (codes renamed,
 *   dimension keys reshuffled), so a code that 404s should degrade to "skip
 *   this series", never to a throw. The connector is built so re-pointing a
 *   series is a one-line edit to DEFAULT_DBNOMICS_SERIES.
 */
import { fetchJsonWithRetry, type Fetcher } from '@/lib/sources/http';
import { logger } from '@/lib/observability/logger';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** A reference to a single DBnomics series, plus presentation metadata. */
export type DbnomicsSeriesRef = {
  /** Upstream provider relayed by DBnomics, e.g. "BIS", "IMF", "OECD". */
  provider: string;
  /** Dataset code within the provider, e.g. "CBPOL", "PP". */
  dataset: string;
  /** Series code within the dataset. */
  series: string;
  /** Canonical, provider-agnostic series key (used downstream). */
  seriesKey: string;
  /** Human-readable label. */
  label: string;
  /** Unit string, e.g. "%", "idx". */
  unit: string;
};

export type DbnomicsPoint = {
  /** Upstream provider relayed by DBnomics (attribution). */
  provider: string;
  /** Canonical series key (provider-agnostic). */
  seriesKey: string;
  label: string;
  /** Latest non-null observation value. */
  value: number;
  unit: string;
  /** Observation period as DBnomics reports it (e.g. "2024" or "2024-Q1"). */
  date: string;
  /** Always "dbnomics" — the aggregator that served the point. */
  sourceSystem: string;
};

export type DbnomicsResult = {
  provider: string;
  points: DbnomicsPoint[];
  fetchedAt: Date;
  /** Non-fatal note; null on a clean run. */
  error: string | null;
};

// ---------------------------------------------------------------------------
// Default basket
// ---------------------------------------------------------------------------
//
// A small, deliberately cheap basket of useful series across KR / US / JP / DE:
// policy rates, CPI inflation, GDP and residential property prices. Codes are
// scaffold-parity (see the note at the top of this file) — validate against a
// live sample before treating values as authoritative.

export const DEFAULT_DBNOMICS_SERIES: DbnomicsSeriesRef[] = [
  // --- Policy / central-bank rates (BIS CBPOL, monthly) ---
  {
    provider: 'BIS',
    dataset: 'CBPOL',
    series: 'M.KR',
    seriesKey: 'policy_rate_pct',
    label: 'KR Central Bank Policy Rate',
    unit: '%'
  },
  {
    provider: 'BIS',
    dataset: 'CBPOL',
    series: 'M.US',
    seriesKey: 'policy_rate_pct',
    label: 'US Central Bank Policy Rate',
    unit: '%'
  },
  {
    provider: 'BIS',
    dataset: 'CBPOL',
    series: 'M.JP',
    seriesKey: 'policy_rate_pct',
    label: 'JP Central Bank Policy Rate',
    unit: '%'
  },
  {
    provider: 'BIS',
    dataset: 'CBPOL',
    series: 'M.XM',
    seriesKey: 'policy_rate_pct',
    label: 'DE/Euro-area Central Bank Policy Rate',
    unit: '%'
  },
  // --- CPI inflation, annual % (IMF IFS) ---
  {
    provider: 'IMF',
    dataset: 'IFS',
    series: 'A.KR.PCPI_PC_CP_A_PT',
    seriesKey: 'inflation_pct',
    label: 'KR CPI Inflation (annual %)',
    unit: '%'
  },
  {
    provider: 'IMF',
    dataset: 'IFS',
    series: 'A.US.PCPI_PC_CP_A_PT',
    seriesKey: 'inflation_pct',
    label: 'US CPI Inflation (annual %)',
    unit: '%'
  },
  {
    provider: 'IMF',
    dataset: 'IFS',
    series: 'A.JP.PCPI_PC_CP_A_PT',
    seriesKey: 'inflation_pct',
    label: 'JP CPI Inflation (annual %)',
    unit: '%'
  },
  {
    provider: 'IMF',
    dataset: 'IFS',
    series: 'A.DE.PCPI_PC_CP_A_PT',
    seriesKey: 'inflation_pct',
    label: 'DE CPI Inflation (annual %)',
    unit: '%'
  },
  // --- GDP growth, annual % (World Bank WDI relayed via DBnomics) ---
  {
    provider: 'WB',
    dataset: 'WDI',
    series: 'NY.GDP.MKTP.KD.ZG-KR',
    seriesKey: 'gdp_growth_pct',
    label: 'KR GDP Growth (annual %)',
    unit: '%'
  },
  {
    provider: 'WB',
    dataset: 'WDI',
    series: 'NY.GDP.MKTP.KD.ZG-US',
    seriesKey: 'gdp_growth_pct',
    label: 'US GDP Growth (annual %)',
    unit: '%'
  },
  {
    provider: 'WB',
    dataset: 'WDI',
    series: 'NY.GDP.MKTP.KD.ZG-JP',
    seriesKey: 'gdp_growth_pct',
    label: 'JP GDP Growth (annual %)',
    unit: '%'
  },
  {
    provider: 'WB',
    dataset: 'WDI',
    series: 'NY.GDP.MKTP.KD.ZG-DE',
    seriesKey: 'gdp_growth_pct',
    label: 'DE GDP Growth (annual %)',
    unit: '%'
  },
  // --- Residential property prices, index (BIS PP selected) ---
  {
    provider: 'BIS',
    dataset: 'PP',
    series: 'Q.KR.N.628',
    seriesKey: 'residential_property_price_index',
    label: 'KR Residential Property Price Index',
    unit: 'idx'
  },
  {
    provider: 'BIS',
    dataset: 'PP',
    series: 'Q.US.N.628',
    seriesKey: 'residential_property_price_index',
    label: 'US Residential Property Price Index',
    unit: 'idx'
  },
  {
    provider: 'BIS',
    dataset: 'PP',
    series: 'Q.JP.N.628',
    seriesKey: 'residential_property_price_index',
    label: 'JP Residential Property Price Index',
    unit: 'idx'
  },
  {
    provider: 'BIS',
    dataset: 'PP',
    series: 'Q.DE.N.628',
    seriesKey: 'residential_property_price_index',
    label: 'DE Residential Property Price Index',
    unit: 'idx'
  }
];

const DBNOMICS_BASE_URL_DEFAULT = 'https://api.db.nomics.world/v22';
const DBNOMICS_SOURCE_SYSTEM = 'dbnomics';

export function isDbnomicsMacroEnabled(): boolean {
  return process.env.ENABLE_DBNOMICS_MACRO === 'true';
}

function parseNumeric(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  // DBnomics encodes missing observations as the string "NA".
  if (typeof value === 'string' && value.trim().toUpperCase() === 'NA') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// DBnomics series endpoint
// ---------------------------------------------------------------------------
//
// Response shape (observations=1):
//   { series: { docs: [ {
//       provider_code, dataset_code, series_code, series_name,
//       period: ["2023","2024",...],          // oldest-first
//       value: [1.2, 2.6, ...]               // aligned, may contain "NA"/null
//     } ] } }

type DbnomicsDoc = {
  provider_code?: string;
  dataset_code?: string;
  series_code?: string;
  series_name?: string;
  period?: string[];
  value?: Array<number | string | null>;
};

type DbnomicsResponse = {
  series?: { docs?: DbnomicsDoc[] };
};

/** Pick the newest (last in oldest-first arrays) non-null observation. */
function newestObservation(doc: DbnomicsDoc): { date: string; value: number } | null {
  const periods = Array.isArray(doc.period) ? doc.period : [];
  const values = Array.isArray(doc.value) ? doc.value : [];
  for (let i = Math.min(periods.length, values.length) - 1; i >= 0; i -= 1) {
    const value = parseNumeric(values[i]);
    if (value !== null) {
      return { date: String(periods[i] ?? ''), value };
    }
  }
  return null;
}

async function fetchDbnomicsSeriesRef(
  ref: DbnomicsSeriesRef,
  fetcher: Fetcher | undefined
): Promise<DbnomicsPoint | null> {
  const baseUrl = (process.env.DBNOMICS_BASE_URL || DBNOMICS_BASE_URL_DEFAULT).replace(/\/$/, '');
  const url = new URL(`${baseUrl}/series/${ref.provider}/${ref.dataset}/${ref.series}`);
  url.searchParams.set('observations', '1');

  const payload = (await fetchJsonWithRetry(
    url.toString(),
    { cache: 'no-store' },
    { fetcher }
  )) as DbnomicsResponse;

  const doc = payload?.series?.docs?.[0];
  if (!doc) return null;

  const latest = newestObservation(doc);
  if (!latest) return null;

  return {
    provider: ref.provider,
    seriesKey: ref.seriesKey,
    label: ref.label,
    value: latest.value,
    unit: ref.unit,
    date: latest.date,
    sourceSystem: DBNOMICS_SOURCE_SYSTEM
  };
}

/**
 * Fetch macro series from DBnomics, one observation per series (newest non-null).
 *
 * Fails closed: when the connector is disabled, or every series errors, returns
 * an empty `points` array with a descriptive (non-throwing) note.
 */
export async function fetchDbnomicsSeries(options?: {
  seriesRefs?: DbnomicsSeriesRef[];
  fetcher?: Fetcher;
}): Promise<DbnomicsResult> {
  const fetchedAt = new Date();

  if (!isDbnomicsMacroEnabled()) {
    return {
      provider: DBNOMICS_SOURCE_SYSTEM,
      points: [],
      fetchedAt,
      error: 'ENABLE_DBNOMICS_MACRO not enabled'
    };
  }

  const refs = options?.seriesRefs?.length ? options.seriesRefs : DEFAULT_DBNOMICS_SERIES;
  const points: DbnomicsPoint[] = [];
  const errors: string[] = [];

  for (const ref of refs) {
    try {
      const point = await fetchDbnomicsSeriesRef(ref, options?.fetcher);
      if (point) points.push(point);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      errors.push(`${ref.provider}/${ref.dataset}/${ref.series}: ${message}`);
      logger.warn('dbnomics_series_fetch_failed', {
        provider: ref.provider,
        dataset: ref.dataset,
        series: ref.series,
        error: message
      });
    }
  }

  return {
    provider: DBNOMICS_SOURCE_SYSTEM,
    points,
    fetchedAt,
    error: errors.length > 0 ? errors.join('; ') : null
  };
}
