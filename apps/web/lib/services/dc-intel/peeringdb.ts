/**
 * PeeringDB data-center interconnection connector.
 *
 * PeeringDB (https://www.peeringdb.com/api) is the canonical, free, keyless
 * JSON source of carrier-neutral data-center facilities and the networks /
 * internet exchanges interconnecting at them. For a firm underwriting data
 * centers, the *density of interconnection* near a candidate site is a strong
 * proxy for site quality: more facilities + more networks present nearby means
 * better connectivity, more carrier choice, and lower latency to peers.
 *
 * This connector takes a location (lat/lng and/or city/country) and returns
 * the nearby facilities plus a bounded "interconnection density" score that can
 * feed a DC site-quality model.
 *
 * Design notes (matches repo conventions):
 *   - Uses the injectable `Fetcher` + `fetchJsonWithRetry` from
 *     `lib/sources/http.ts` so unit tests need no network.
 *   - Keyless but rate-limited. Live calls are gated behind `ENABLE_PEERINGDB`
 *     (default off). When disabled or on any failure (timeout / HTTP error /
 *     malformed body) the connector returns an empty, well-typed result and
 *     logs a warning — it never throws, so it can't break a caller's flow.
 *
 * SCAFFOLD-PARITY CAVEATS (intentionally coarse, need calibration):
 *   - Distance filtering is a bounding box around the location (plus an
 *     optional exact city/country match), not a true haversine radius. Good
 *     enough for a density signal; tighten later if a hard radius is required.
 *   - The score weights (facility vs. network saturation, the soft caps) are
 *     placeholder values picked to give sane 0–100 spreads. Calibrate against
 *     known-good vs. known-poor sites before relying on absolute values.
 */

import { fetchJsonWithRetry, type Fetcher } from '@/lib/sources/http';
import { logger } from '@/lib/observability/logger';
import { clamp } from '@/lib/math';

export const PEERINGDB_API_BASE = 'https://www.peeringdb.com/api';

/** A single PeeringDB facility, narrowed to the fields we use. */
export type PeeringDbFacility = {
  id: number;
  name: string;
  city: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  /** Number of networks present at the facility (PeeringDB `net_count`). */
  netCount: number;
};

export type PeeringDbLocationInput = {
  /** Latitude in decimal degrees. Optional if `city` is supplied. */
  latitude?: number;
  /** Longitude in decimal degrees. Optional if `city` is supplied. */
  longitude?: number;
  /** City name to filter on (PeeringDB matches on exact city string). */
  city?: string;
  /** ISO-3166 alpha-2 country code (e.g. "KR", "US") to narrow the query. */
  country?: string;
  /**
   * Half-width of the lat/lng bounding box, in degrees. Coarse proxy for a
   * radius (~111km per degree of latitude). Default 0.5° (~55km).
   */
  boxDegrees?: number;
};

export type PeeringDbInterconnectionResult = {
  facilities: PeeringDbFacility[];
  /** Count of facilities matched near the location. */
  facilityCount: number;
  /** Sum of `net_count` across matched facilities. */
  totalNetworks: number;
  /**
   * Bounded 0–100 interconnection-density score. Higher = denser
   * interconnection near the location. See `scoreInterconnectionDensity`.
   */
  interconnectionScore: number;
};

const EMPTY_RESULT: PeeringDbInterconnectionResult = {
  facilities: [],
  facilityCount: 0,
  totalNetworks: 0,
  interconnectionScore: 0
};

/** Default bounding-box half-width in degrees (~55km in latitude). */
const DEFAULT_BOX_DEGREES = 0.5;

/**
 * Score calibration constants. These are deliberate placeholders — the score
 * shape is documented, the magnitudes are not calibrated. Tune before relying
 * on the absolute value (the relative ordering is the useful part today).
 */
const SCORE_FACILITY_SATURATION = 10; // facilities at which the facility term ~saturates
const SCORE_NETWORK_SATURATION = 200; // total networks at which the network term ~saturates
const SCORE_FACILITY_WEIGHT = 0.45; // weight of facility breadth
const SCORE_NETWORK_WEIGHT = 0.55; // weight of network depth

function isEnabled(): boolean {
  const raw = process.env.ENABLE_PEERINGDB?.trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Bounded interconnection-density score in [0, 100].
 *
 * Formula (documented, coarse — see scaffold-parity caveats):
 *   facilityTerm = facilityCount / (facilityCount + SCORE_FACILITY_SATURATION)
 *   networkTerm  = totalNetworks / (totalNetworks + SCORE_NETWORK_SATURATION)
 *   score = 100 * (FACILITY_WEIGHT * facilityTerm + NETWORK_WEIGHT * networkTerm)
 *
 * Each term is a saturating curve in [0, 1): it grows fast for the first few
 * facilities/networks then flattens, so a handful of facilities already scores
 * meaningfully while a hyperscale hub doesn't run away unboundedly. Weights sum
 * to 1, so the result is naturally bounded to [0, 100).
 */
export function scoreInterconnectionDensity(facilityCount: number, totalNetworks: number): number {
  const facilities = Math.max(0, facilityCount);
  const networks = Math.max(0, totalNetworks);

  const facilityTerm = facilities === 0 ? 0 : facilities / (facilities + SCORE_FACILITY_SATURATION);
  const networkTerm = networks === 0 ? 0 : networks / (networks + SCORE_NETWORK_SATURATION);

  const raw = 100 * (SCORE_FACILITY_WEIGHT * facilityTerm + SCORE_NETWORK_WEIGHT * networkTerm);
  return roundTo(clamp(raw, 0, 100), 1);
}

type RawFacility = {
  id?: unknown;
  name?: unknown;
  city?: unknown;
  country?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  net_count?: unknown;
};

function toNumberOrNull(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeFacility(raw: RawFacility): PeeringDbFacility | null {
  const id = toNumberOrNull(raw.id);
  if (id === null) return null;
  return {
    id,
    name: typeof raw.name === 'string' ? raw.name : String(raw.name ?? ''),
    city: typeof raw.city === 'string' && raw.city.length > 0 ? raw.city : null,
    country: typeof raw.country === 'string' && raw.country.length > 0 ? raw.country : null,
    latitude: toNumberOrNull(raw.latitude),
    longitude: toNumberOrNull(raw.longitude),
    netCount: Math.max(0, toNumberOrNull(raw.net_count) ?? 0)
  };
}

/**
 * Parse a raw PeeringDB `/api/fac` response body into normalized facilities,
 * applying the coarse bounding-box / city filter. Exported for unit testing.
 */
export function parseFacilities(body: unknown, input: PeeringDbLocationInput): PeeringDbFacility[] {
  const rows = (body as { data?: unknown })?.data;
  if (!Array.isArray(rows)) return [];

  const facilities: PeeringDbFacility[] = [];
  for (const row of rows) {
    const fac = normalizeFacility(row as RawFacility);
    if (fac && matchesLocation(fac, input)) {
      facilities.push(fac);
    }
  }
  return facilities;
}

function matchesLocation(fac: PeeringDbFacility, input: PeeringDbLocationInput): boolean {
  // City filter (case-insensitive exact match) when a city is supplied.
  if (input.city) {
    if (!fac.city || fac.city.toLowerCase() !== input.city.toLowerCase()) return false;
  }

  // Country filter when supplied.
  if (input.country) {
    if (!fac.country || fac.country.toLowerCase() !== input.country.toLowerCase()) return false;
  }

  // Bounding-box filter when coordinates are supplied on both sides.
  if (input.latitude !== undefined && input.longitude !== undefined) {
    if (fac.latitude === null || fac.longitude === null) return false;
    const box = input.boxDegrees ?? DEFAULT_BOX_DEGREES;
    if (Math.abs(fac.latitude - input.latitude) > box) return false;
    if (Math.abs(fac.longitude - input.longitude) > box) return false;
  }

  return true;
}

function buildResult(facilities: PeeringDbFacility[]): PeeringDbInterconnectionResult {
  const facilityCount = facilities.length;
  const totalNetworks = facilities.reduce((sum, f) => sum + f.netCount, 0);
  return {
    facilities,
    facilityCount,
    totalNetworks,
    interconnectionScore: scoreInterconnectionDensity(facilityCount, totalNetworks)
  };
}

/**
 * Build the `/api/fac` query URL. PeeringDB supports server-side filtering on
 * `city` and `country`; lat/lng has no native radius filter, so we fetch the
 * country/city slice (or, as a fallback, an unbounded page) and box-filter
 * client-side.
 */
function buildFacilitiesUrl(input: PeeringDbLocationInput): string {
  const url = new URL(`${PEERINGDB_API_BASE}/fac`);
  if (input.city) url.searchParams.set('city', input.city);
  if (input.country) url.searchParams.set('country', input.country);
  // Cap page size so an unfiltered query can't pull the whole planet.
  url.searchParams.set('limit', '500');
  return url.toString();
}

/**
 * Fetch nearby data-center facilities and compute an interconnection-density
 * signal for a location.
 *
 * Gated behind `ENABLE_PEERINGDB`. When disabled, or on any error/timeout,
 * returns `EMPTY_RESULT` (never throws). Pass a `fetcher` to inject a fake in
 * tests.
 */
export async function fetchInterconnectionSignal(
  input: PeeringDbLocationInput,
  options?: { fetcher?: Fetcher; timeoutMs?: number }
): Promise<PeeringDbInterconnectionResult> {
  if (!isEnabled()) {
    logger.debug('peeringdb_disabled', { reason: 'ENABLE_PEERINGDB not set' });
    return EMPTY_RESULT;
  }

  if (
    input.city === undefined &&
    input.country === undefined &&
    (input.latitude === undefined || input.longitude === undefined)
  ) {
    logger.warn('peeringdb_missing_location', {
      reason: 'need city, country, or lat+lng'
    });
    return EMPTY_RESULT;
  }

  const url = buildFacilitiesUrl(input);
  const timeoutMs = options?.timeoutMs ?? 8_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const body = await fetchJsonWithRetry(
      url,
      { cache: 'no-store', signal: controller.signal, headers: { Accept: 'application/json' } },
      { fetcher: options?.fetcher }
    );
    const facilities = parseFacilities(body, input);
    return buildResult(facilities);
  } catch (error) {
    logger.warn('peeringdb_fetch_failed', {
      url,
      error: error instanceof Error ? error.message : String(error)
    });
    return EMPTY_RESULT;
  } finally {
    clearTimeout(timer);
  }
}
