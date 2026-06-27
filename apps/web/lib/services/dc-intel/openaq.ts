/**
 * OpenAQ air-quality connector (ESG / environmental site-quality signal).
 *
 * OpenAQ (https://openaq.org, docs https://docs.openaq.org) aggregates global
 * open air-quality measurements (PM2.5, PM10, NO2, O3, …) from government and
 * research monitoring stations. For a firm underwriting data centers / real
 * assets, ambient air quality near a candidate site is a useful ESG and
 * site-quality signal: sustained high PM2.5 affects worker health, cooling
 * intake filtration, equipment longevity, and local regulatory / community
 * risk. This connector takes a location (lat/lng) and returns a
 * representative latest value per pollutant from the nearby monitoring
 * stations.
 *
 * Design notes (matches repo conventions, mirrors `peeringdb.ts`):
 *   - Uses the injectable `Fetcher` + `fetchJsonWithRetry` from
 *     `lib/sources/http.ts` so unit tests need no network.
 *   - The OpenAQ v3 API requires a free API key sent as an `X-API-Key`
 *     header. Live calls are gated behind `OPENAQ_API_KEY`: when the key is
 *     unset the connector returns an empty, well-typed result and makes no
 *     network call. On any failure (timeout / HTTP error / malformed body) it
 *     also returns an empty result and logs a warning — it never throws, so it
 *     can't break a caller's flow.
 *   - Attribution: data is © OpenAQ and its upstream providers. The `source`
 *     field on the result preserves this; keep it when surfacing values.
 *
 * ENDPOINTS (OpenAQ v3 — https://docs.openaq.org):
 *   1. Locations near a point:
 *        GET /v3/locations?coordinates={lat},{lng}&radius={meters}&limit={n}
 *      Returns monitoring locations, each with a `sensors` array describing
 *      which pollutants (`parameter.name`) that location measures.
 *   2. Latest measurements for a location:
 *        GET /v3/locations/{id}/latest
 *      Returns the most recent value per sensor at that location.
 *   Both require the `X-API-Key` header.
 *
 * SCAFFOLD-PARITY CAVEATS (need live-sample validation before relying on
 * absolute values):
 *   - Exact v3 field names and nesting (`results[].sensors[].parameter.name`,
 *     `results[].latest[].value`, the `datetime`/`datetimeLast` shapes) are
 *     transcribed from the docs but should be confirmed against a live sample;
 *     `parseAirQuality` is intentionally defensive about shape so a minor
 *     rename degrades to "missing pollutant", not a throw.
 *   - "Representative value per pollutant" is the **mean** of the latest
 *     readings across the matched stations within the radius — a coarse
 *     spatial aggregate, not a true annual mean. For an annual-mean PM2.5
 *     figure you would query a measurements/averages endpoint over a date
 *     window; this connector returns the freshest cross-station snapshot.
 *   - `radius` is capped by the API at 25_000m. We clamp to that.
 */

import { env } from '@/lib/env';
import { fetchJsonWithRetry, type Fetcher } from '@/lib/sources/http';
import { logger } from '@/lib/observability/logger';

export const OPENAQ_API_BASE = 'https://api.openaq.org/v3';

/** Attribution string carried on every result. */
export const OPENAQ_SOURCE = 'OpenAQ';

/** OpenAQ caps the locations radius at 25km. */
export const OPENAQ_MAX_RADIUS_METERS = 25_000;

/** Default search radius around the point (meters). */
const DEFAULT_RADIUS_METERS = 10_000;

/** Pollutants we surface, keyed by OpenAQ `parameter.name`. */
const POLLUTANT_PARAMETERS = ['pm25', 'pm10', 'no2', 'o3'] as const;
type PollutantParameter = (typeof POLLUTANT_PARAMETERS)[number];

export type AirQualityInput = {
  /** Latitude in decimal degrees. */
  latitude: number;
  /** Longitude in decimal degrees. */
  longitude: number;
  /**
   * Search radius around the point in meters. Defaults to 10km, clamped to the
   * API maximum of 25km.
   */
  radiusMeters?: number;
};

export type AirQualityResult = {
  /** Number of monitoring stations matched within the radius. */
  stationCount: number;
  /** Representative (mean of latest) PM2.5 in µg/m³, if any station reports it. */
  pm25?: number;
  /** Representative PM10 in µg/m³, if any station reports it. */
  pm10?: number;
  /** Representative NO2, if any station reports it (units per provider). */
  no2?: number;
  /** Representative O3, if any station reports it (units per provider). */
  o3?: number;
  /** Most recent measurement timestamp across the matched values (ISO 8601). */
  asOf?: string;
  /** Attribution / provenance. Always `OPENAQ_SOURCE`. */
  source: string;
};

const EMPTY_RESULT: AirQualityResult = {
  stationCount: 0,
  source: OPENAQ_SOURCE
};

function apiKey(): string | null {
  const raw = env().OPENAQ_API_KEY?.trim();
  return raw && raw.length > 0 ? raw : null;
}

function clampRadius(radiusMeters: number | undefined): number {
  const requested = radiusMeters ?? DEFAULT_RADIUS_METERS;
  if (!Number.isFinite(requested) || requested <= 0) return DEFAULT_RADIUS_METERS;
  return Math.min(OPENAQ_MAX_RADIUS_METERS, Math.round(requested));
}

function toNumberOrNull(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Normalize a free-form parameter name to one of our tracked pollutants. */
function toPollutant(value: unknown): PollutantParameter | null {
  if (typeof value !== 'string') return null;
  const key = value.trim().toLowerCase().replace(/[.\s]/g, '');
  return (POLLUTANT_PARAMETERS as readonly string[]).includes(key)
    ? (key as PollutantParameter)
    : null;
}

/**
 * Pull a measurement timestamp out of the several shapes OpenAQ v3 uses
 * (`datetime` can be a string or `{ utc }`; latest rows use `datetime` or
 * `datetimeLast`). Returns an ISO string or null.
 */
/**
 * True when `candidate` is a later instant than `current`. We compare by parsed
 * epoch millis, NOT lexicographically: ISO-8601 strings with different UTC
 * offsets (e.g. "…T12:00:00+09:00" = 03:00Z vs "…T04:00:00Z") sort differently
 * as text than in real time, so a raw `>` would pick the wrong "latest" reading.
 * Falls back to a string compare only when either value isn't a parseable date.
 */
function isChronologicallyAfter(candidate: string, current: string): boolean {
  const c = Date.parse(candidate);
  const k = Date.parse(current);
  if (Number.isFinite(c) && Number.isFinite(k)) return c > k;
  return candidate > current;
}

function extractTimestamp(row: Record<string, unknown>): string | null {
  const candidates = [row.datetime, row.datetimeLast, row.lastUpdated];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.length > 0) return candidate;
    if (candidate && typeof candidate === 'object') {
      const utc = (candidate as { utc?: unknown }).utc;
      if (typeof utc === 'string' && utc.length > 0) return utc;
    }
  }
  return null;
}

type Accumulator = {
  [K in PollutantParameter]?: { sum: number; count: number };
};

/**
 * Parse the combined OpenAQ v3 payload — the `/locations` response plus the
 * per-location `/latest` responses — into a single representative result.
 *
 * @param locationsBody body of `GET /v3/locations`
 * @param latestBodies  bodies of `GET /v3/locations/{id}/latest`, one per
 *                      matched location. Each is shape `{ results: [...] }`.
 *
 * Exported for unit testing. Defensive about field shape: anything it can't
 * read is skipped, never thrown.
 */
export function parseAirQuality(locationsBody: unknown, latestBodies: unknown[]): AirQualityResult {
  const locations = (locationsBody as { results?: unknown })?.results;
  const stationCount = Array.isArray(locations) ? locations.length : 0;

  const acc: Accumulator = {};
  let latestTs: string | null = null;

  for (const body of latestBodies) {
    const rows = (body as { results?: unknown })?.results;
    if (!Array.isArray(rows)) continue;

    for (const raw of rows) {
      if (!raw || typeof raw !== 'object') continue;
      const row = raw as Record<string, unknown>;

      // The pollutant name can live on `parameter.name`, `parameter` (string),
      // or a flat `parameter`/`name` field depending on endpoint version.
      const parameterField = row.parameter ?? row.sensor ?? row.name;
      const parameterName =
        parameterField && typeof parameterField === 'object'
          ? ((parameterField as { name?: unknown; parameter?: unknown }).name ??
            (parameterField as { parameter?: unknown }).parameter)
          : parameterField;
      const pollutant = toPollutant(parameterName);
      if (!pollutant) continue;

      const value = toNumberOrNull(row.value);
      if (value === null) continue;

      const bucket = acc[pollutant] ?? { sum: 0, count: 0 };
      bucket.sum += value;
      bucket.count += 1;
      acc[pollutant] = bucket;

      const ts = extractTimestamp(row);
      if (ts && (latestTs === null || isChronologicallyAfter(ts, latestTs))) latestTs = ts;
    }
  }

  const result: AirQualityResult = { stationCount, source: OPENAQ_SOURCE };
  for (const pollutant of POLLUTANT_PARAMETERS) {
    const bucket = acc[pollutant];
    if (bucket && bucket.count > 0) {
      // Round to 1 dp — these are µg/m³-scale ambient concentrations.
      result[pollutant] = Math.round((bucket.sum / bucket.count) * 10) / 10;
    }
  }
  if (latestTs) result.asOf = latestTs;

  return result;
}

/** Extract numeric location ids from a `/v3/locations` response body. */
function extractLocationIds(locationsBody: unknown): number[] {
  const rows = (locationsBody as { results?: unknown })?.results;
  if (!Array.isArray(rows)) return [];
  const ids: number[] = [];
  for (const row of rows) {
    const id = toNumberOrNull((row as { id?: unknown })?.id);
    if (id !== null) ids.push(id);
  }
  return ids;
}

function buildLocationsUrl(input: AirQualityInput, radiusMeters: number): string {
  const url = new URL(`${OPENAQ_API_BASE}/locations`);
  url.searchParams.set('coordinates', `${input.latitude},${input.longitude}`);
  url.searchParams.set('radius', String(radiusMeters));
  // Cap the page so a dense metro can't pull an unbounded list.
  url.searchParams.set('limit', '100');
  return url.toString();
}

/**
 * Fetch a representative latest air-quality reading per pollutant near a point.
 *
 * Gated behind `OPENAQ_API_KEY`. When the key is unset, or on any
 * error/timeout, returns an empty result (never throws, no network call when
 * the key is missing). Pass a `fetcher` to inject a fake in tests.
 */
export async function fetchAirQuality(
  input: AirQualityInput,
  options?: { fetcher?: Fetcher; timeoutMs?: number }
): Promise<AirQualityResult> {
  const key = apiKey();
  if (!key) {
    logger.debug('openaq_disabled', { reason: 'OPENAQ_API_KEY not set' });
    return EMPTY_RESULT;
  }

  if (!Number.isFinite(input.latitude) || !Number.isFinite(input.longitude)) {
    logger.warn('openaq_invalid_coordinates', {
      latitude: input.latitude,
      longitude: input.longitude
    });
    return EMPTY_RESULT;
  }

  const radiusMeters = clampRadius(input.radiusMeters);
  const headers = { Accept: 'application/json', 'X-API-Key': key };
  const timeoutMs = options?.timeoutMs ?? 8_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const locationsUrl = buildLocationsUrl(input, radiusMeters);
    const locationsBody = await fetchJsonWithRetry(
      locationsUrl,
      { cache: 'no-store', signal: controller.signal, headers },
      { fetcher: options?.fetcher }
    );

    const ids = extractLocationIds(locationsBody);
    if (ids.length === 0) {
      return { stationCount: 0, source: OPENAQ_SOURCE };
    }

    const latestBodies = await Promise.all(
      ids.map((id) =>
        fetchJsonWithRetry(
          `${OPENAQ_API_BASE}/locations/${id}/latest`,
          { cache: 'no-store', signal: controller.signal, headers },
          { fetcher: options?.fetcher }
        )
      )
    );

    return parseAirQuality(locationsBody, latestBodies);
  } catch (error) {
    logger.warn('openaq_fetch_failed', {
      latitude: input.latitude,
      longitude: input.longitude,
      radiusMeters,
      error: error instanceof Error ? error.message : String(error)
    });
    return EMPTY_RESULT;
  } finally {
    clearTimeout(timer);
  }
}
