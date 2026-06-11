/**
 * World Bank + OECD worldwide macro connectors.
 *
 * The existing macro stack (lib/sources/adapters/macro.ts +
 * lib/services/macro/data-providers.ts) is single-market: KOSIS/BOK for KR,
 * FRED/BLS/Treasury for US, ECB for the euro area. For cross-country macro
 * comparison ("policy rate in IN is 250bps above KR", "GDP growth in VN
 * leads the region") the engine needs a keyless worldwide source.
 *
 * This module ships two FREE, keyless connectors behind an injectable
 * `Fetcher` (so tests never hit the network), mirroring the
 * createMacroAdapter / createCrossMarketAdapter shape:
 *
 *   - World Bank Indicators API (MUST-HAVE, no key):
 *       https://api.worldbank.org/v2/country/{ISO2}/indicator/{CODE}?format=json
 *     Returns one JSON array whose [1] element is the observation list,
 *     newest first. We take the newest non-null observation per indicator.
 *
 *   - OECD SDMX-JSON (no key) as a thin secondary probe for OECD-member
 *     short-term rates / CPI. The SDMX dataflow + dimension keys vary by
 *     dataset and need live calibration (see scaffold-parity note below),
 *     so the OECD path is wired through the same retry/Fetcher plumbing but
 *     intentionally minimal.
 *
 * Live-vs-fallback decision (matches siblings):
 *   - World Bank needs no key, so it is gated on an explicit enable flag
 *     `ENABLE_WORLD_BANK_MACRO` (default off, like ENABLE_OSM_GEOCODER) so
 *     CI/dev stay network-free. When unset, `fetchWorldBankMacro` returns an
 *     empty result with a "not enabled" note — it NEVER throws into callers.
 *   - OECD is gated on `ENABLE_OECD_MACRO` (default off) for the same reason.
 *   - On any per-indicator failure/timeout we log a warning and skip that
 *     indicator; a single bad series never sinks the whole result.
 *
 * SCAFFOLD-PARITY NOTE (matches the cross-market.ts maturity disclaimer):
 *   The indicator-code -> field mapping below (NY.GDP.MKTP.KD.ZG, FR.INR.LEND,
 *   FP.CPI.TOTL.ZG, plus the RPPI residential-property-price code) is wired
 *   against the documented World Bank schema but MUST be validated against a
 *   live sample before the values are treated as authoritative — some codes
 *   (notably the residential property price index) have sparse / lagged
 *   coverage for many economies and may return an all-null observation list.
 *   The OECD SDMX dataflow/key shape likewise needs live calibration.
 */
import { fetchJsonWithRetry, type Fetcher } from '@/lib/sources/http';
import { logger } from '@/lib/observability/logger';

// ---------------------------------------------------------------------------
// Public types — typed cross-country series (country, indicator, value, date)
// ---------------------------------------------------------------------------

export type WorldwideMacroSeriesKey =
  | 'gdp_growth_pct'
  | 'lending_rate_pct'
  | 'inflation_pct'
  | 'residential_property_price_index';

export type WorldwideMacroPoint = {
  /** ISO-2 country code as requested, e.g. "KR", "US", "IN". */
  country: string;
  /** Canonical series key (provider-agnostic). */
  seriesKey: WorldwideMacroSeriesKey;
  /** Upstream indicator code, e.g. "NY.GDP.MKTP.KD.ZG". */
  indicator: string;
  label: string;
  /** Latest non-null observation value. */
  value: number;
  unit: string;
  /** Observation period as the provider reports it (e.g. "2024"). */
  date: string;
  sourceSystem: string;
};

export type WorldwideMacroResult = {
  provider: string;
  /** Countries actually requested (ISO-2, upper-cased). */
  countries: string[];
  points: WorldwideMacroPoint[];
  fetchedAt: Date;
  /** Non-fatal note; null on a clean run. */
  error: string | null;
};

// ---------------------------------------------------------------------------
// World Bank indicator mapping
// ---------------------------------------------------------------------------

type WorldBankIndicatorMapping = {
  code: string;
  seriesKey: WorldwideMacroSeriesKey;
  label: string;
  unit: string;
};

const WORLD_BANK_INDICATORS: WorldBankIndicatorMapping[] = [
  {
    code: 'NY.GDP.MKTP.KD.ZG',
    seriesKey: 'gdp_growth_pct',
    label: 'GDP growth (annual %)',
    unit: '%'
  },
  {
    code: 'FR.INR.LEND',
    seriesKey: 'lending_rate_pct',
    label: 'Lending interest rate (%)',
    unit: '%'
  },
  {
    code: 'FP.CPI.TOTL.ZG',
    seriesKey: 'inflation_pct',
    label: 'Inflation, consumer prices (annual %)',
    unit: '%'
  },
  {
    // Residential property price index. Coverage is sparse/lagged for many
    // economies — see the scaffold-parity note at the top of this file.
    code: 'RPPI',
    seriesKey: 'residential_property_price_index',
    label: 'Residential property price index',
    unit: 'idx'
  }
];

/**
 * Default basket of economies the worldwide connector tracks when the caller
 * does not pass an explicit list. Overridable via WORLD_BANK_COUNTRIES
 * (comma-separated ISO-2). Kept deliberately small so a default run is cheap.
 */
const DEFAULT_COUNTRIES = ['KR', 'US', 'JP', 'CN', 'IN', 'DE', 'GB', 'SG'];

const WORLD_BANK_BASE_URL_DEFAULT = 'https://api.worldbank.org/v2';
const WORLD_BANK_SOURCE_SYSTEM = 'world-bank-indicators';
const OECD_SOURCE_SYSTEM = 'oecd-sdmx';

export function isWorldBankMacroEnabled(): boolean {
  return process.env.ENABLE_WORLD_BANK_MACRO === 'true';
}

export function isOecdMacroEnabled(): boolean {
  return process.env.ENABLE_OECD_MACRO === 'true';
}

function resolveCountries(requested?: string[]): string[] {
  if (requested && requested.length > 0) {
    return requested.map((c) => c.trim().toUpperCase()).filter(Boolean);
  }
  const fromEnv = process.env.WORLD_BANK_COUNTRIES?.trim();
  if (fromEnv) {
    return fromEnv
      .split(',')
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean);
  }
  return [...DEFAULT_COUNTRIES];
}

function parseNumeric(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// World Bank Indicators API
// ---------------------------------------------------------------------------
//
// Response shape:
//   [ { page, pages, per_page, total, ... },
//     [ { indicator: {id,value}, country: {id,value}, countryiso3code,
//         date: "2024", value: 2.6 }, ... ]  // newest first
//   ]

type WorldBankObservation = {
  indicator?: { id?: string; value?: string };
  country?: { id?: string; value?: string };
  countryiso3code?: string;
  date?: string;
  value?: number | string | null;
};

type WorldBankResponse = [unknown, WorldBankObservation[] | null] | unknown;

function extractWorldBankObservations(payload: WorldBankResponse): WorldBankObservation[] {
  if (!Array.isArray(payload) || payload.length < 2) return [];
  const rows = payload[1];
  return Array.isArray(rows) ? (rows as WorldBankObservation[]) : [];
}

async function fetchWorldBankIndicator(
  country: string,
  mapping: WorldBankIndicatorMapping,
  fetcher: Fetcher | undefined
): Promise<WorldwideMacroPoint | null> {
  const baseUrl = (process.env.WORLD_BANK_BASE_URL || WORLD_BANK_BASE_URL_DEFAULT).replace(
    /\/$/,
    ''
  );
  const perPage = process.env.WORLD_BANK_PER_PAGE || '60';
  const url = new URL(`${baseUrl}/country/${country}/indicator/${mapping.code}`);
  url.searchParams.set('format', 'json');
  url.searchParams.set('per_page', perPage);

  const payload = (await fetchJsonWithRetry(
    url.toString(),
    { cache: 'no-store' },
    { fetcher }
  )) as WorldBankResponse;

  const observations = extractWorldBankObservations(payload);
  // Observations come newest-first; take the newest with a real value.
  const latest = observations.find((row) => parseNumeric(row.value) !== null);
  const value = parseNumeric(latest?.value);
  if (value === null || !latest) return null;

  return {
    country,
    seriesKey: mapping.seriesKey,
    indicator: mapping.code,
    label: mapping.label,
    value,
    unit: mapping.unit,
    date: String(latest.date ?? ''),
    sourceSystem: WORLD_BANK_SOURCE_SYSTEM
  };
}

/**
 * Fetch worldwide macro series from the World Bank Indicators API.
 *
 * Fails closed: when the connector is disabled, or every indicator errors,
 * returns an empty `points` array with a descriptive (non-throwing) note.
 */
export async function fetchWorldBankMacro(options?: {
  countries?: string[];
  fetcher?: Fetcher;
}): Promise<WorldwideMacroResult> {
  const fetchedAt = new Date();

  if (!isWorldBankMacroEnabled()) {
    return {
      provider: WORLD_BANK_SOURCE_SYSTEM,
      countries: [],
      points: [],
      fetchedAt,
      error: 'ENABLE_WORLD_BANK_MACRO not enabled'
    };
  }

  const countries = resolveCountries(options?.countries);
  const points: WorldwideMacroPoint[] = [];
  const errors: string[] = [];

  for (const country of countries) {
    for (const mapping of WORLD_BANK_INDICATORS) {
      try {
        const point = await fetchWorldBankIndicator(country, mapping, options?.fetcher);
        if (point) points.push(point);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown error';
        errors.push(`${country}/${mapping.code}: ${message}`);
        logger.warn('world_bank_indicator_fetch_failed', {
          country,
          indicator: mapping.code,
          error: message
        });
      }
    }
  }

  return {
    provider: WORLD_BANK_SOURCE_SYSTEM,
    countries,
    points,
    fetchedAt,
    error: errors.length > 0 ? errors.join('; ') : null
  };
}

// ---------------------------------------------------------------------------
// OECD SDMX-JSON (secondary, scaffold)
// ---------------------------------------------------------------------------
//
// OECD exposes keyless SDMX-JSON at e.g.
//   https://sdmx.oecd.org/public/rest/data/{dataflow}/{key}?format=jsondata
// The dataflow + dimension key shape varies per dataset and needs live
// calibration, so this path is a thin reachability probe wired through the
// same retry/Fetcher plumbing. It fails closed exactly like World Bank.

export async function fetchOecdMacro(options?: {
  fetcher?: Fetcher;
}): Promise<WorldwideMacroResult> {
  const fetchedAt = new Date();

  if (!isOecdMacroEnabled()) {
    return {
      provider: OECD_SOURCE_SYSTEM,
      countries: [],
      points: [],
      fetchedAt,
      error: 'ENABLE_OECD_MACRO not enabled'
    };
  }

  const baseUrl = process.env.OECD_SDMX_PROBE_URL?.trim();
  if (!baseUrl) {
    return {
      provider: OECD_SOURCE_SYSTEM,
      countries: [],
      points: [],
      fetchedAt,
      error: 'OECD_SDMX_PROBE_URL not configured'
    };
  }

  try {
    const probe = await fetchJsonWithRetry(
      baseUrl,
      { cache: 'no-store' },
      { fetcher: options?.fetcher }
    );
    const reachable = probe !== null && probe !== undefined;
    return {
      provider: OECD_SOURCE_SYSTEM,
      countries: [],
      points: [],
      fetchedAt,
      error: reachable
        ? 'OECD reachable; per-dataflow series mapping TODO (scaffold-parity)'
        : 'OECD probe returned empty payload'
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    logger.warn('oecd_macro_probe_failed', { error: message });
    return {
      provider: OECD_SOURCE_SYSTEM,
      countries: [],
      points: [],
      fetchedAt,
      error: `OECD probe failed: ${message}`
    };
  }
}
