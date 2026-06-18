/**
 * OpenStreetMap Overpass POI-density connector.
 *
 * The Overpass API (https://overpass-api.de/api/interpreter) is a free, keyless
 * read-only query endpoint over live OpenStreetMap data (~10k requests/day per
 * the public-instance fair-use policy). It lets us count points-of-interest /
 * amenities — restaurants, shops, transit stops, offices, schools, hospitals,
 * banks, … — within a radius of an arbitrary location anywhere in the world
 * (Korea included).
 *
 * For a firm underwriting retail / office / mixed-use sites, the *density of
 * amenities* near a candidate location is a strong proxy for foot traffic,
 * walkability, and latent demand: more food + retail + transit nearby means a
 * livelier, more accessible, more valuable catchment. This connector takes a
 * lat/lng + radius and returns category counts plus a bounded 0–100
 * amenity/walkability score that can feed a site-demand model.
 *
 * The firm already uses OSM for keyless geocoding (see
 * `lib/services/geocode/osm-geocode.ts`), so an OSM amenity connector is a
 * natural extension of the same data lineage.
 *
 * Design notes (matches repo conventions, mirrors
 * `lib/services/dc-intel/peeringdb.ts`):
 *   - Uses the injectable `Fetcher` + `fetchJsonWithRetry` from
 *     `lib/sources/http.ts` so unit tests need no network.
 *   - Keyless but rate-limited. Live calls are gated behind
 *     `ENABLE_OVERPASS_POI` (default off) so CI/dev stay deterministic and we
 *     respect the public Overpass fair-use limits. When disabled, or on any
 *     failure (missing location / timeout / HTTP error / malformed body) the
 *     connector returns an empty, well-typed result and logs a warning — it
 *     never throws, so it can't break a caller's flow.
 *   - Optional `OVERPASS_API_URL` override (e.g. a self-hosted mirror).
 *
 * Attribution: POI data is © OpenStreetMap contributors, ODbL. The result
 * carries a `source` field so downstream consumers can surface attribution.
 *
 * SCAFFOLD-PARITY CAVEATS (intentionally coarse, need calibration):
 *   - The category → OSM tag mapping (`CATEGORY_TAG_FILTERS`) is a pragmatic
 *     selection, not an exhaustive ontology. Tune the tag set per market.
 *   - The score weights and saturation constants are placeholder values chosen
 *     to give sane 0–100 spreads. Calibrate against known walkable vs. car-
 *     dependent sites before relying on absolute values; relative ordering is
 *     the useful part today.
 *   - `out count;` returns OSM element counts, not de-duplicated "businesses".
 *     A single venue can carry multiple tagged elements; this is a density
 *     proxy, not a registry.
 */

import { fetchJsonWithRetry, type Fetcher } from '@/lib/sources/http';
import { logger } from '@/lib/observability/logger';
import { clamp } from '@/lib/math';

export const OVERPASS_API_DEFAULT_URL = 'https://overpass-api.de/api/interpreter';

/** Attribution string for downstream display. */
export const OVERPASS_SOURCE = '© OpenStreetMap contributors';

/**
 * Descriptive User-Agent. overpass-api.de's Apache front-end performs content
 * negotiation and rejects requests with `406 Not Acceptable` when they carry a
 * narrow `Accept: application/json` header (the response is served as
 * `application/osm3s+json`) and/or lack a descriptive User-Agent. We send a
 * permissive `Accept` of any type (the `[out:json]` directive already pins the
 * body to JSON) plus this UA to stay within Overpass usage policy.
 */
const OVERPASS_USER_AGENT = 'NexusSeoul-DCIntel/1.0 (+https://nexus-seoul.example)';

/** The amenity categories we bucket POIs into. */
export type PoiCategory =
  | 'food'
  | 'retail'
  | 'transit'
  | 'office'
  | 'health'
  | 'education'
  | 'finance';

export const POI_CATEGORIES: readonly PoiCategory[] = [
  'food',
  'retail',
  'transit',
  'office',
  'health',
  'education',
  'finance'
] as const;

/**
 * Per-category Overpass tag filter snippets. Each entry is a list of
 * `["key"~"v1|v2"]` / `["key"]` filters; a node matching ANY of the listed
 * filters is counted in that category. Coarse by design — see caveats.
 */
const CATEGORY_TAG_FILTERS: Record<PoiCategory, string[]> = {
  food: ['["amenity"~"restaurant|cafe|fast_food|bar|pub|food_court"]'],
  retail: ['["shop"]', '["amenity"~"marketplace"]'],
  transit: [
    '["public_transport"~"station|stop_position|platform"]',
    '["highway"~"bus_stop"]',
    '["railway"~"station|tram_stop|subway_entrance"]'
  ],
  office: ['["office"]', '["amenity"~"coworking_space"]'],
  health: ['["amenity"~"hospital|clinic|doctors|pharmacy|dentist"]'],
  education: ['["amenity"~"school|university|college|kindergarten|library"]'],
  finance: ['["amenity"~"bank|atm|bureau_de_change"]']
};

export type PoiDensityInput = {
  /** Latitude in decimal degrees. */
  latitude: number;
  /** Longitude in decimal degrees. */
  longitude: number;
  /** Search radius in meters. Default 800m (~10 min walk). */
  radiusMeters?: number;
};

export type PoiDensityResult = {
  /** Sum of all category counts. */
  totalPoi: number;
  /** POI element counts keyed by category. */
  byCategory: Record<PoiCategory, number>;
  /**
   * Bounded 0–100 amenity / walkability score. Higher = denser, more diverse
   * amenity mix near the location. See `scoreAmenityDensity`.
   */
  amenityScore: number;
  /** Attribution string — always `OVERPASS_SOURCE`. */
  source: string;
};

const EMPTY_BY_CATEGORY: Record<PoiCategory, number> = {
  food: 0,
  retail: 0,
  transit: 0,
  office: 0,
  health: 0,
  education: 0,
  finance: 0
};

function emptyResult(): PoiDensityResult {
  return {
    totalPoi: 0,
    byCategory: { ...EMPTY_BY_CATEGORY },
    amenityScore: 0,
    source: OVERPASS_SOURCE
  };
}

/** Default search radius in meters (~10 minute walk). */
const DEFAULT_RADIUS_METERS = 800;

/**
 * Score calibration constants. Deliberate placeholders — the score *shape* is
 * documented, the magnitudes are not calibrated. Tune before relying on the
 * absolute value (relative ordering is the useful part today).
 */
const SCORE_TOTAL_SATURATION = 120; // total POIs at which the volume term ~saturates
const SCORE_VOLUME_WEIGHT = 0.6; // weight of raw amenity volume
const SCORE_DIVERSITY_WEIGHT = 0.4; // weight of category breadth

function isEnabled(): boolean {
  const raw = process.env.ENABLE_OVERPASS_POI?.trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

function endpointUrl(): string {
  return process.env.OVERPASS_API_URL?.trim() || OVERPASS_API_DEFAULT_URL;
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Bounded amenity / walkability score in [0, 100].
 *
 * Formula (documented, coarse — see scaffold-parity caveats):
 *   volumeTerm    = totalPoi / (totalPoi + SCORE_TOTAL_SATURATION)   // [0, 1)
 *   diversityTerm = (#categories with >=1 POI) / (#categories)        // [0, 1]
 *   score = 100 * (VOLUME_WEIGHT * volumeTerm + DIVERSITY_WEIGHT * diversityTerm)
 *
 * The volume term is a saturating curve: it grows fast for the first dozens of
 * POIs then flattens, so a handful of amenities already registers while a dense
 * urban core doesn't run away unboundedly. The diversity term rewards a
 * balanced mix (food + transit + retail + …) over a monoculture of one tag.
 * Weights sum to 1, so the result is naturally bounded to [0, 100].
 */
export function scoreAmenityDensity(byCategory: Record<PoiCategory, number>): number {
  const counts = POI_CATEGORIES.map((c) => Math.max(0, byCategory[c] ?? 0));
  const total = counts.reduce((sum, n) => sum + n, 0);
  const presentCategories = counts.filter((n) => n > 0).length;

  const volumeTerm = total === 0 ? 0 : total / (total + SCORE_TOTAL_SATURATION);
  const diversityTerm = presentCategories / POI_CATEGORIES.length;

  const raw = 100 * (SCORE_VOLUME_WEIGHT * volumeTerm + SCORE_DIVERSITY_WEIGHT * diversityTerm);
  return roundTo(clamp(raw, 0, 100), 1);
}

/**
 * Build an Overpass QL query that emits one `out count;` block per category, in
 * the fixed order of `POI_CATEGORIES`. We count `node`/`way`/`relation`
 * elements with each category's tag filters inside the radius.
 *
 * Example (food only):
 *   [out:json][timeout:25];
 *   (node["amenity"~"restaurant|cafe"](around:800,37.5,127.0);
 *    way["amenity"~"restaurant|cafe"](around:800,37.5,127.0);
 *    relation["amenity"~"restaurant|cafe"](around:800,37.5,127.0););
 *   out count;
 */
export function buildOverpassQuery(input: PoiDensityInput): string {
  const radius = Math.max(1, Math.round(input.radiusMeters ?? DEFAULT_RADIUS_METERS));
  const lat = input.latitude;
  const lng = input.longitude;
  const around = `(around:${radius},${lat},${lng})`;

  const blocks = POI_CATEGORIES.map((category) => {
    const filters = CATEGORY_TAG_FILTERS[category];
    const members = filters
      .flatMap((filter) => ['node', 'way', 'relation'].map((type) => `${type}${filter}${around};`))
      .join('');
    return `(${members});out count;`;
  });

  return `[out:json][timeout:25];${blocks.join('')}`;
}

type OverpassCountElement = {
  type?: unknown;
  tags?: { total?: unknown; nodes?: unknown; ways?: unknown; relations?: unknown };
};

type OverpassResponse = { elements?: unknown };

function toNonNegInt(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * Parse an Overpass `out count;` response into per-category counts.
 *
 * Each `out count;` block yields one element of `type: "count"` whose
 * `tags.total` is the matched element count. Because we emit the count blocks
 * in `POI_CATEGORIES` order, we map the i-th count element back to the i-th
 * category. Missing / malformed elements default to 0. Exported for testing.
 */
export function parseCountResponse(body: unknown): Record<PoiCategory, number> {
  const result: Record<PoiCategory, number> = { ...EMPTY_BY_CATEGORY };
  const elements = (body as OverpassResponse)?.elements;
  if (!Array.isArray(elements)) return result;

  const counts = (elements as OverpassCountElement[])
    .filter((el) => el?.type === 'count')
    .map((el) => toNonNegInt(el?.tags?.total));

  POI_CATEGORIES.forEach((category, index) => {
    result[category] = counts[index] ?? 0;
  });

  return result;
}

function buildResult(byCategory: Record<PoiCategory, number>): PoiDensityResult {
  const totalPoi = POI_CATEGORIES.reduce((sum, c) => sum + byCategory[c], 0);
  return {
    totalPoi,
    byCategory,
    amenityScore: scoreAmenityDensity(byCategory),
    source: OVERPASS_SOURCE
  };
}

function hasValidLocation(input: PoiDensityInput): boolean {
  return (
    typeof input.latitude === 'number' &&
    Number.isFinite(input.latitude) &&
    Math.abs(input.latitude) <= 90 &&
    typeof input.longitude === 'number' &&
    Number.isFinite(input.longitude) &&
    Math.abs(input.longitude) <= 180
  );
}

/**
 * Fetch OSM POI density near a location and compute an amenity/walkability
 * signal.
 *
 * Gated behind `ENABLE_OVERPASS_POI`. When disabled, or on any error/timeout/
 * malformed body, returns an empty result (never throws). Pass a `fetcher` to
 * inject a fake in tests.
 */
export async function fetchPoiDensity(
  input: PoiDensityInput,
  options?: { fetcher?: Fetcher; timeoutMs?: number }
): Promise<PoiDensityResult> {
  if (!isEnabled()) {
    logger.debug('overpass_poi_disabled', { reason: 'ENABLE_OVERPASS_POI not set' });
    return emptyResult();
  }

  if (!hasValidLocation(input)) {
    logger.warn('overpass_poi_missing_location', { reason: 'need finite lat/lng in range' });
    return emptyResult();
  }

  const url = endpointUrl();
  const query = buildOverpassQuery(input);
  const timeoutMs = options?.timeoutMs ?? 25_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const body = await fetchJsonWithRetry(
      url,
      {
        method: 'POST',
        cache: 'no-store',
        signal: controller.signal,
        headers: {
          Accept: '*/*',
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': OVERPASS_USER_AGENT
        },
        body: new URLSearchParams({ data: query }).toString()
      },
      { fetcher: options?.fetcher }
    );
    const byCategory = parseCountResponse(body);
    return buildResult(byCategory);
  } catch (error) {
    logger.warn('overpass_poi_fetch_failed', {
      url,
      error: error instanceof Error ? error.message : String(error)
    });
    return emptyResult();
  } finally {
    clearTimeout(timer);
  }
}
