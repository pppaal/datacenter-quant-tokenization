/**
 * Global power / grid / carbon-intensity connectors.
 *
 * The firm's existing grid signal is Korea-only (KEPCO substation snapshots in
 * `lib/services/public-data/live/kepco-grid.ts`). Data-center site quality is
 * power-bound everywhere, so this module adds free global sources behind the
 * same conventions as the other live adapters (`adapters/macro.ts`,
 * `adapters/cross-market.ts`): each call goes through `fetchJsonWithRetry` with
 * an injectable `Fetcher` (so unit tests need no network), is gated on its env
 * key/flag, and FAILS CLOSED — a missing key or any transport/HTTP/parse error
 * returns `null` (or `[]`), never throws, so existing flows are never broken.
 *
 * Sources wired:
 *   - ElectricityMaps (https://api.electricitymap.org/v3) — real-time/recent
 *     grid CARBON INTENSITY (gCO2eq/kWh) + power breakdown by zone. Free tier
 *     uses an `auth-token` request header. This is the primary signal and is
 *     consumable via `fetchCarbonIntensity(zone)` and the zone-mapping helper
 *     `electricityMapsZoneForMarket()`.
 *   - EIA (https://api.eia.gov/v2) — US electricity retail price (and a hook
 *     for generation mix) via the `api_key` query param.
 *   - ENTSO-E Transparency (https://web-api.tp.entsoe.eu/api) — European grid
 *     load/generation. XML API; this ships only a keyless-gated reachability
 *     scaffold (see TODO in `probeEntsoe`).
 *
 * Maturity / scaffold-parity (matches the other live adapters):
 *   - Endpoints + auth shapes are correct per published docs, but the exact
 *     zone-code coverage and response field names need live-sample validation
 *     against a real token before trusting them in underwriting. ElectricityMaps
 *     zone codes in particular are an evolving list (e.g. `US-CAL-CISO`,
 *     `DE`, `KR`); the `MARKET_TO_EM_ZONE` table below covers the firm's active
 *     markets only.
 *   - ENTSO-E is XML and document-type-driven; this module only probes
 *     reachability + leaves a TODO for per-documentType parsing.
 */
import { fetchJsonWithRetry, fetchTextWithRetry, type Fetcher } from '@/lib/sources/http';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CarbonIntensityPoint = {
  /** ElectricityMaps zone code, e.g. "KR", "US-CAL-CISO", "DE". */
  zone: string;
  /** Latest grid carbon intensity in gCO2eq/kWh (lifecycle, per EM default). */
  carbonIntensityGco2PerKwh: number | null;
  /** Share of consumption from fossil-free sources (renewables + nuclear), 0–100. */
  fossilFreePct: number | null;
  /** Share of consumption from renewables, 0–100. */
  renewablePct: number | null;
  /** ISO-8601 timestamp of the upstream datapoint. */
  asOf: string | null;
  source: 'electricitymaps';
};

export type EiaElectricityPoint = {
  /** EIA region/state code echoed from the query (e.g. "US", "CAL"). */
  region: string;
  /** Average retail electricity price in cents per kWh (EIA native unit). */
  retailPriceCentsPerKwh: number | null;
  /** Period label from EIA (e.g. "2026-03"). */
  period: string | null;
  source: 'eia';
};

export type EntsoeProbeResult = {
  reachable: boolean;
  /** Short human label for ops; e.g. "Reachable; documentType parsing TODO". */
  note: string;
  source: 'entsoe';
};

type ElectricityMapsCarbonResponse = {
  zone?: string;
  carbonIntensity?: number;
  datetime?: string;
  updatedAt?: string;
};

type ElectricityMapsBreakdownResponse = {
  zone?: string;
  datetime?: string;
  fossilFreePercentage?: number;
  renewablePercentage?: number;
};

type EiaResponse = {
  response?: {
    data?: Array<Record<string, string | number | null>>;
  };
};

// ---------------------------------------------------------------------------
// Zone mapping — firm markets → ElectricityMaps zone codes
// ---------------------------------------------------------------------------
// ElectricityMaps keys everything by zone code. The firm's market codes (used
// across macro/cross-market adapters) map as below. Sub-national US grids use
// balancing-authority zones (e.g. CAISO → US-CAL-CISO); add rows as new DC
// markets come online. Validate any new code against EM's live zone list.

const MARKET_TO_EM_ZONE: Record<string, string> = {
  KR: 'KR', // South Korea (KEPCO)
  KOREA: 'KR',
  US: 'US', // US national average; prefer a balancing-authority zone below
  'US-CAL-CISO': 'US-CAL-CISO', // California ISO (common hyperscale DC region)
  CAISO: 'US-CAL-CISO',
  'US-TEX-ERCO': 'US-TEX-ERCO', // ERCOT / Texas
  ERCOT: 'US-TEX-ERCO',
  'US-MIDA-PJM': 'US-MIDA-PJM', // PJM (Northern Virginia DC alley)
  PJM: 'US-MIDA-PJM',
  DE: 'DE', // Germany
  GERMANY: 'DE',
  JP: 'JP', // Japan (national)
  HK: 'HK',
  GB: 'GB',
  UK: 'GB',
  FR: 'FR',
  IE: 'IE', // Ireland (Dublin DC cluster)
  SG: 'SG'
};

/**
 * Resolve a firm market/country code to an ElectricityMaps zone code.
 * Returns null when the market has no known mapping (caller should skip rather
 * than guess a zone). Case-insensitive on the input.
 */
export function electricityMapsZoneForMarket(market: string | null | undefined): string | null {
  if (!market) return null;
  const key = market.trim().toUpperCase();
  return MARKET_TO_EM_ZONE[key] ?? null;
}

// ---------------------------------------------------------------------------
// Configuration helpers
// ---------------------------------------------------------------------------

const EM_BASE_URL = 'https://api.electricitymap.org/v3';
const EIA_BASE_URL = 'https://api.eia.gov/v2';
const ENTSOE_BASE_URL = 'https://web-api.tp.entsoe.eu/api';

function getElectricityMapsToken(): string | null {
  const token = process.env.ELECTRICITYMAPS_API_TOKEN?.trim();
  return token ? token : null;
}

function getEiaApiKey(): string | null {
  const key = process.env.EIA_API_KEY?.trim();
  return key ? key : null;
}

function getEntsoeToken(): string | null {
  const token = process.env.ENTSOE_API_TOKEN?.trim();
  return token ? token : null;
}

export function isElectricityMapsConfigured(): boolean {
  return getElectricityMapsToken() !== null;
}

export function isEiaConfigured(): boolean {
  return getEiaApiKey() !== null;
}

export function isEntsoeConfigured(): boolean {
  return getEntsoeToken() !== null;
}

function toFiniteNumber(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : (value as number);
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// ElectricityMaps — carbon intensity + power breakdown (PRIMARY signal)
// ---------------------------------------------------------------------------

/**
 * Fetch the latest grid carbon intensity (+ fossil-free / renewable share) for
 * an ElectricityMaps zone. Pass a zone code directly ("KR", "US-CAL-CISO") or
 * use `electricityMapsZoneForMarket()` to map a firm market code first.
 *
 * Fails closed: returns null when `ELECTRICITYMAPS_API_TOKEN` is unset or on any
 * transport/HTTP/parse error. The breakdown call is best-effort — a carbon point
 * is still returned (with null shares) if only the breakdown endpoint fails.
 */
export async function fetchCarbonIntensity(
  zone: string,
  options?: { fetcher?: Fetcher }
): Promise<CarbonIntensityPoint | null> {
  const token = getElectricityMapsToken();
  if (!token) return null;
  if (!zone || !zone.trim()) return null;

  const fetcher = options?.fetcher;
  const headers = { 'auth-token': token, cache: 'no-store' } as Record<string, string>;
  const init: RequestInit = { headers, cache: 'no-store' };
  const zoneParam = encodeURIComponent(zone.trim());

  let carbon: ElectricityMapsCarbonResponse;
  try {
    carbon = (await fetchJsonWithRetry(
      `${EM_BASE_URL}/carbon-intensity/latest?zone=${zoneParam}`,
      init,
      { fetcher }
    )) as ElectricityMapsCarbonResponse;
  } catch {
    return null;
  }

  // Power breakdown is a separate endpoint; treat it as best-effort.
  let fossilFreePct: number | null = null;
  let renewablePct: number | null = null;
  try {
    const breakdown = (await fetchJsonWithRetry(
      `${EM_BASE_URL}/power-breakdown/latest?zone=${zoneParam}`,
      init,
      { fetcher }
    )) as ElectricityMapsBreakdownResponse;
    fossilFreePct = toFiniteNumber(breakdown.fossilFreePercentage);
    renewablePct = toFiniteNumber(breakdown.renewablePercentage);
  } catch {
    // leave shares null — carbon intensity alone is still useful
  }

  return {
    zone: typeof carbon.zone === 'string' ? carbon.zone : zone.trim(),
    carbonIntensityGco2PerKwh: toFiniteNumber(carbon.carbonIntensity),
    fossilFreePct,
    renewablePct,
    asOf: carbon.datetime ?? carbon.updatedAt ?? null,
    source: 'electricitymaps'
  };
}

/**
 * Convenience wrapper: resolve a firm market code to an EM zone, then fetch.
 * Returns null when the market has no zone mapping or the source fails closed.
 */
export async function fetchCarbonIntensityForMarket(
  market: string | null | undefined,
  options?: { fetcher?: Fetcher }
): Promise<CarbonIntensityPoint | null> {
  const zone = electricityMapsZoneForMarket(market);
  if (!zone) return null;
  return fetchCarbonIntensity(zone, options);
}

// ---------------------------------------------------------------------------
// EIA — US electricity retail price (+ generation-mix hook)
// ---------------------------------------------------------------------------

/**
 * Fetch the most recent US average retail electricity price for a region from
 * EIA's electricity retail-sales dataset. `region` is an EIA state/region code
 * ("US" national, "CAL", "TEX", ...). Sector defaults to "ALL".
 *
 * Fails closed: returns null when `EIA_API_KEY` is unset or on any error.
 *
 * Endpoint: GET /v2/electricity/retail-sales/data
 *   ?api_key=...&frequency=monthly&data[0]=price
 *   &facets[stateid][]=<region>&facets[sectorid][]=ALL
 *   &sort[0][column]=period&sort[0][direction]=desc&length=1
 */
export async function fetchEiaElectricityPrice(
  region = 'US',
  options?: { fetcher?: Fetcher; sector?: string }
): Promise<EiaElectricityPoint | null> {
  const apiKey = getEiaApiKey();
  if (!apiKey) return null;

  const sector = options?.sector ?? 'ALL';
  const url = new URL(`${EIA_BASE_URL}/electricity/retail-sales/data`);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('frequency', 'monthly');
  url.searchParams.append('data[0]', 'price');
  url.searchParams.append('facets[stateid][]', region);
  url.searchParams.append('facets[sectorid][]', sector);
  url.searchParams.append('sort[0][column]', 'period');
  url.searchParams.append('sort[0][direction]', 'desc');
  url.searchParams.set('length', '1');

  let body: EiaResponse;
  try {
    body = (await fetchJsonWithRetry(
      url.toString(),
      { cache: 'no-store' },
      {
        fetcher: options?.fetcher
      }
    )) as EiaResponse;
  } catch {
    return null;
  }

  const row = body.response?.data?.[0];
  if (!row) {
    return { region, retailPriceCentsPerKwh: null, period: null, source: 'eia' };
  }

  return {
    region: typeof row.stateid === 'string' ? row.stateid : region,
    retailPriceCentsPerKwh: toFiniteNumber(row.price),
    period: typeof row.period === 'string' ? row.period : null,
    source: 'eia'
  };
}

// ---------------------------------------------------------------------------
// ENTSO-E — European grid load/generation (keyless reachability scaffold)
// ---------------------------------------------------------------------------

/**
 * Probe ENTSO-E Transparency reachability for a bidding-zone EIC code.
 *
 * ENTSO-E returns XML keyed by `documentType` (e.g. A65 = total load, A75 =
 * actual generation per type) and requires a `securityToken` plus a
 * `periodStart`/`periodEnd` window in `YYYYMMDDHHmm` UTC. This scaffold only
 * confirms the endpoint is reachable and the token is accepted; it does not
 * parse the XML payload.
 *
 * Fails closed: returns null when `ENTSOE_API_TOKEN` is unset.
 *
 * TODO(live-sample): implement per-documentType XML parsing once a real token
 * is available — map A65/A75 timeseries into a typed load/generation point and
 * surface alongside the carbon signal. Needs a real `in_Domain` EIC code table
 * (e.g. 10Y1001A1001A83F = Germany) and tz-correct period windows.
 */
export async function probeEntsoe(
  inDomainEic: string,
  options?: { fetcher?: Fetcher; documentType?: string }
): Promise<EntsoeProbeResult | null> {
  const token = getEntsoeToken();
  if (!token) return null;
  if (!inDomainEic || !inDomainEic.trim()) return null;

  const documentType = options?.documentType ?? 'A65'; // system total load
  const url = new URL(ENTSOE_BASE_URL);
  url.searchParams.set('securityToken', token);
  url.searchParams.set('documentType', documentType);
  url.searchParams.set('processType', 'A16'); // realised
  url.searchParams.set('outBiddingZone_Domain', inDomainEic.trim());

  // A short, recent UTC window keeps the probe cheap. Real per-series wiring
  // should widen and align this to the documentType's cadence.
  const now = new Date();
  const start = new Date(now.getTime() - 60 * 60 * 1000);
  const fmt = (d: Date) =>
    `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(
      d.getUTCDate()
    ).padStart(2, '0')}${String(d.getUTCHours()).padStart(2, '0')}00`;
  url.searchParams.set('periodStart', fmt(start));
  url.searchParams.set('periodEnd', fmt(now));

  try {
    const xml = await fetchTextWithRetry(
      url.toString(),
      { cache: 'no-store' },
      {
        fetcher: options?.fetcher
      }
    );
    const reachable = typeof xml === 'string' && xml.length > 0;
    return {
      reachable,
      note: reachable
        ? 'Reachable; documentType XML parsing TODO (see probeEntsoe docstring)'
        : 'Empty response; check EIC code / token',
      source: 'entsoe'
    };
  } catch {
    return {
      reachable: false,
      note: 'Probe failed (transport/auth); re-run after verifying ENTSOE_API_TOKEN',
      source: 'entsoe'
    };
  }
}

// ---------------------------------------------------------------------------
// Aggregate helper — which connectors are live
// ---------------------------------------------------------------------------

export function getConfiguredPowerGridProviders(): string[] {
  const providers: string[] = [];
  if (isElectricityMapsConfigured()) providers.push('electricitymaps');
  if (isEiaConfigured()) providers.push('eia');
  if (isEntsoeConfigured()) providers.push('entsoe');
  return providers;
}
