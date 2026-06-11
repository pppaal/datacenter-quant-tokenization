/**
 * ThinkHazard! worldwide natural-hazard site-risk connector.
 *
 * ThinkHazard! (https://thinkhazard.org, GFDRR / World Bank) is an open,
 * keyless service that classifies the hazard level — High / Medium / Low /
 * Very Low — of an administrative area for 11 natural hazards (river flood,
 * urban flood, coastal flood, earthquake, tsunami, cyclone, water scarcity,
 * extreme heat, wildfire, landslide, volcano). For a firm underwriting data
 * centers / real assets anywhere in the world, this gives a consistent,
 * comparable natural-hazard signal for a candidate site.
 *
 * This connector takes either a lat/lng or an explicit ThinkHazard admin
 * division id and returns the per-hazard classified levels plus a bounded
 * 0–100 site-risk score (higher = riskier) and the subset of hazards that are
 * High risk.
 *
 * Design notes (matches repo conventions, mirrors
 * `lib/services/dc-intel/peeringdb.ts`):
 *   - Uses the injectable `Fetcher` + `fetchJsonWithRetry` from
 *     `lib/sources/http.ts` so unit tests need no network.
 *   - Keyless but gated behind `ENABLE_THINKHAZARD` (default off). When
 *     disabled, or on any failure (missing location / timeout / HTTP error /
 *     malformed body) the connector returns an empty, well-typed result and
 *     logs a warning — it never throws, so it can't break a caller's flow.
 *
 * API endpoints (see https://github.com/GFDRR/thinkhazard/blob/master/API.md):
 *   - Coordinate → admin division:
 *       GET {BASE}/administrativedivision?lon={lon}&lat={lat}
 *     Returns the smallest matching administrative division, including its id.
 *   - Hazard report for an admin division:
 *       GET {BASE}/report/{admin_div_id}.json
 *     Returns an array of per-hazard entries with a hazard type and a
 *     classified level (the "hazardlevel" mnemonic: HIG / MED / LOW / VLO).
 *
 * SCAFFOLD-PARITY CAVEATS (need live-sample validation before relying on it):
 *   - The exact JSON field names below (`hazardtype`/`mnemonic`,
 *     `hazardlevel`/`mnemonic`, and the admin-division `id` field) are taken
 *     from the documented API shape but have NOT been validated against a live
 *     response in this environment. `parseHazardReport` is deliberately
 *     tolerant (checks several candidate keys) and the field-name assumptions
 *     are isolated here so calibration is a one-file change.
 *   - The score weighting (per-level ordinal points + per-hazard weights) is a
 *     documented but uncalibrated placeholder. The relative ordering is the
 *     useful part today; calibrate magnitudes before trusting absolute values.
 *
 * Attribution: hazard classifications are sourced from GFDRR ThinkHazard!
 * (World Bank). Each result carries `source: 'GFDRR ThinkHazard!'`.
 */

import { fetchJsonWithRetry, type Fetcher } from '@/lib/sources/http';
import { logger } from '@/lib/observability/logger';

export const THINKHAZARD_API_BASE =
  process.env.THINKHAZARD_API_BASE?.trim() || 'https://thinkhazard.org';

export const THINKHAZARD_SOURCE = 'GFDRR ThinkHazard!';

/** The 11 hazard types ThinkHazard! classifies. */
export type ThinkHazardType =
  | 'river_flood'
  | 'urban_flood'
  | 'coastal_flood'
  | 'earthquake'
  | 'tsunami'
  | 'cyclone'
  | 'water_scarcity'
  | 'extreme_heat'
  | 'wildfire'
  | 'landslide'
  | 'volcano';

/** The 4 ThinkHazard! hazard levels, ordered low → high. */
export type ThinkHazardLevel = 'Very Low' | 'Low' | 'Medium' | 'High';

export type SiteHazard = {
  hazardType: ThinkHazardType;
  level: ThinkHazardLevel;
};

export type FetchSiteHazardsInput =
  | { latitude: number; longitude: number; adminId?: never }
  | { adminId: number; latitude?: never; longitude?: never };

export type SiteHazardsResult = {
  hazards: SiteHazard[];
  /**
   * Bounded 0–100 site-risk score. Higher = riskier. See
   * `scoreSiteHazards` for the documented weighting.
   */
  overallRiskScore: number;
  /** Hazard types classified as High. */
  highRiskHazards: ThinkHazardType[];
  /** Attribution. Always `GFDRR ThinkHazard!`. */
  source: string;
};

const EMPTY_RESULT: SiteHazardsResult = {
  hazards: [],
  overallRiskScore: 0,
  highRiskHazards: [],
  source: THINKHAZARD_SOURCE
};

/**
 * Ordinal points per level (Very Low → High). Linear 0/1/2/3 mapped onto a
 * 0–1 scale by dividing by `MAX_LEVEL_POINTS`. Documented, uncalibrated.
 */
const LEVEL_POINTS: Record<ThinkHazardLevel, number> = {
  'Very Low': 0,
  Low: 1,
  Medium: 2,
  High: 3
};
const MAX_LEVEL_POINTS = 3;

/**
 * Per-hazard weights for the site-risk score. Hazards that more directly
 * threaten a data-center / built asset (earthquake, the floods, cyclone,
 * tsunami) carry more weight than slower-onset ones (water scarcity, extreme
 * heat) or geographically rarer ones (volcano). Placeholder magnitudes — the
 * score is normalized by the sum of the weights of the hazards actually
 * present, so missing hazards don't deflate the score.
 */
const HAZARD_WEIGHTS: Record<ThinkHazardType, number> = {
  earthquake: 1.0,
  river_flood: 0.9,
  coastal_flood: 0.9,
  urban_flood: 0.8,
  cyclone: 0.8,
  tsunami: 0.7,
  landslide: 0.6,
  wildfire: 0.6,
  extreme_heat: 0.5,
  water_scarcity: 0.4,
  volcano: 0.4
};

function isEnabled(): boolean {
  const raw = process.env.ENABLE_THINKHAZARD?.trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Bounded site-risk score in [0, 100]. Higher = riskier.
 *
 * Formula (documented, coarse — see scaffold-parity caveats):
 *   For each hazard h present:
 *     levelFraction(h) = LEVEL_POINTS[level(h)] / MAX_LEVEL_POINTS   // 0..1
 *     contribution(h)  = HAZARD_WEIGHTS[type(h)] * levelFraction(h)
 *   score = 100 * sum(contribution) / sum(HAZARD_WEIGHTS[type] over present h)
 *
 * Normalizing by the summed weight of the *present* hazards keeps the score a
 * weighted-average severity in [0, 100] regardless of how many of the 11
 * hazards the report actually returns. An all-"High" site scores 100; an
 * all-"Very Low" site scores 0.
 */
export function scoreSiteHazards(hazards: SiteHazard[]): number {
  if (hazards.length === 0) return 0;

  let weightedSum = 0;
  let weightTotal = 0;
  for (const hazard of hazards) {
    const weight = HAZARD_WEIGHTS[hazard.hazardType];
    const levelFraction = LEVEL_POINTS[hazard.level] / MAX_LEVEL_POINTS;
    weightedSum += weight * levelFraction;
    weightTotal += weight;
  }

  if (weightTotal === 0) return 0;
  return roundTo(clamp((100 * weightedSum) / weightTotal, 0, 100), 1);
}

/**
 * Map a ThinkHazard! hazard-type mnemonic / slug to our `ThinkHazardType`.
 * ThinkHazard uses short mnemonics (e.g. `FL`, `EQ`, `TS`) and full slugs;
 * we accept both. Unknown types return null and are skipped.
 */
function normalizeHazardType(raw: string): ThinkHazardType | null {
  const key = raw.trim().toUpperCase();
  const byMnemonic: Record<string, ThinkHazardType> = {
    FL: 'river_flood',
    UF: 'urban_flood',
    CF: 'coastal_flood',
    EQ: 'earthquake',
    TS: 'tsunami',
    CY: 'cyclone',
    DG: 'water_scarcity', // "drought" in ThinkHazard taxonomy
    DR: 'water_scarcity',
    EH: 'extreme_heat',
    WF: 'wildfire',
    LS: 'landslide',
    VA: 'volcano'
  };
  if (byMnemonic[key]) return byMnemonic[key];

  const bySlug: Record<string, ThinkHazardType> = {
    'RIVER FLOOD': 'river_flood',
    'URBAN FLOOD': 'urban_flood',
    'COASTAL FLOOD': 'coastal_flood',
    EARTHQUAKE: 'earthquake',
    TSUNAMI: 'tsunami',
    CYCLONE: 'cyclone',
    'WATER SCARCITY': 'water_scarcity',
    DROUGHT: 'water_scarcity',
    'EXTREME HEAT': 'extreme_heat',
    WILDFIRE: 'wildfire',
    LANDSLIDE: 'landslide',
    VOLCANO: 'volcano'
  };
  return bySlug[key] ?? null;
}

/**
 * Map a ThinkHazard! hazard-level mnemonic / label to a `ThinkHazardLevel`.
 * Mnemonics per the API: HIG / MED / LOW / VLO. "No data" is treated as
 * Very Low so it doesn't inflate the risk score. Unknown levels return null.
 */
function normalizeLevel(raw: string): ThinkHazardLevel | null {
  const key = raw.trim().toUpperCase();
  switch (key) {
    case 'HIG':
    case 'HIGH':
      return 'High';
    case 'MED':
    case 'MEDIUM':
      return 'Medium';
    case 'LOW':
      return 'Low';
    case 'VLO':
    case 'VERY LOW':
    case 'NO DATA':
      return 'Very Low';
    default:
      return null;
  }
}

function asString(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) return value;
  return null;
}

/**
 * Extract a hazard-type token from a raw report entry, tolerant of the several
 * shapes the documented API uses (a `hazardtype` object with a `mnemonic`, a
 * flat `hazard_type` string, etc.). Isolated here per scaffold-parity caveat.
 */
function extractHazardTypeToken(entry: Record<string, unknown>): string | null {
  const ht = entry.hazardtype;
  if (ht && typeof ht === 'object') {
    const o = ht as Record<string, unknown>;
    return asString(o.mnemonic) ?? asString(o.title) ?? asString(o.hazardtype);
  }
  return (
    asString(entry.hazardtype) ??
    asString(entry.hazard_type) ??
    asString(entry.mnemonic) ??
    asString(entry.title)
  );
}

/** Extract a hazard-level token, tolerant of the documented shapes. */
function extractLevelToken(entry: Record<string, unknown>): string | null {
  const hl = entry.hazardlevel;
  if (hl && typeof hl === 'object') {
    const o = hl as Record<string, unknown>;
    return asString(o.mnemonic) ?? asString(o.title);
  }
  return asString(entry.hazardlevel) ?? asString(entry.hazard_level) ?? asString(entry.level);
}

/**
 * Parse a raw ThinkHazard! `/report/{id}.json` response body into normalized
 * site hazards. Accepts either a top-level array or an object wrapping the
 * array under a common key. Exported for unit testing.
 */
export function parseHazardReport(body: unknown): SiteHazard[] {
  let rows: unknown = body;
  if (!Array.isArray(rows) && body && typeof body === 'object') {
    const o = body as Record<string, unknown>;
    rows = o.hazards ?? o.report ?? o.data ?? o.results;
  }
  if (!Array.isArray(rows)) return [];

  const seen = new Set<ThinkHazardType>();
  const hazards: SiteHazard[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const entry = row as Record<string, unknown>;

    const typeToken = extractHazardTypeToken(entry);
    const levelToken = extractLevelToken(entry);
    if (!typeToken || !levelToken) continue;

    const hazardType = normalizeHazardType(typeToken);
    const level = normalizeLevel(levelToken);
    if (!hazardType || !level || seen.has(hazardType)) continue;

    seen.add(hazardType);
    hazards.push({ hazardType, level });
  }
  return hazards;
}

/**
 * Parse a ThinkHazard! `/administrativedivision?lon=&lat=` response body into
 * an admin division id. The endpoint returns the matching division(s); we take
 * the most specific (smallest / last) one's id. Tolerant of array or single
 * object shapes. Exported for unit testing.
 */
export function parseAdminDivisionId(body: unknown): number | null {
  const pickId = (o: Record<string, unknown>): number | null => {
    const candidate = o.id ?? o.admin_id ?? o.code;
    const n = Number(candidate);
    return Number.isFinite(n) ? n : null;
  };

  if (Array.isArray(body)) {
    // Most specific division is typically the last / deepest entry.
    for (let i = body.length - 1; i >= 0; i -= 1) {
      const row = body[i];
      if (row && typeof row === 'object') {
        const id = pickId(row as Record<string, unknown>);
        if (id !== null) return id;
      }
    }
    return null;
  }
  if (body && typeof body === 'object') {
    return pickId(body as Record<string, unknown>);
  }
  return null;
}

function buildResult(hazards: SiteHazard[]): SiteHazardsResult {
  return {
    hazards,
    overallRiskScore: scoreSiteHazards(hazards),
    highRiskHazards: hazards.filter((h) => h.level === 'High').map((h) => h.hazardType),
    source: THINKHAZARD_SOURCE
  };
}

async function resolveAdminId(
  latitude: number,
  longitude: number,
  fetcher: Fetcher | undefined,
  signal: AbortSignal
): Promise<number | null> {
  const url = new URL(`${THINKHAZARD_API_BASE}/administrativedivision`);
  url.searchParams.set('lon', String(longitude));
  url.searchParams.set('lat', String(latitude));
  const body = await fetchJsonWithRetry(
    url.toString(),
    { cache: 'no-store', signal, headers: { Accept: 'application/json' } },
    { fetcher }
  );
  return parseAdminDivisionId(body);
}

/**
 * Fetch classified natural-hazard levels and a bounded site-risk score for a
 * location (lat/lng) or an explicit ThinkHazard admin division id.
 *
 * Gated behind `ENABLE_THINKHAZARD`. When disabled, given no usable location,
 * or on any error/timeout, returns `EMPTY_RESULT` (never throws). Pass a
 * `fetcher` to inject a fake in tests.
 */
export async function fetchSiteHazards(
  input: FetchSiteHazardsInput,
  options?: { fetcher?: Fetcher; timeoutMs?: number }
): Promise<SiteHazardsResult> {
  if (!isEnabled()) {
    logger.debug('thinkhazard_disabled', { reason: 'ENABLE_THINKHAZARD not set' });
    return EMPTY_RESULT;
  }

  const hasCoords =
    typeof input.latitude === 'number' &&
    Number.isFinite(input.latitude) &&
    typeof input.longitude === 'number' &&
    Number.isFinite(input.longitude);
  const hasAdminId = typeof input.adminId === 'number' && Number.isFinite(input.adminId);

  if (!hasCoords && !hasAdminId) {
    logger.warn('thinkhazard_missing_location', { reason: 'need lat+lng or adminId' });
    return EMPTY_RESULT;
  }

  const timeoutMs = options?.timeoutMs ?? 8_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let adminId: number | null = hasAdminId ? (input.adminId as number) : null;
    if (adminId === null && hasCoords) {
      adminId = await resolveAdminId(
        input.latitude as number,
        input.longitude as number,
        options?.fetcher,
        controller.signal
      );
    }

    if (adminId === null) {
      logger.warn('thinkhazard_admin_unresolved', {
        reason: 'no admin division for location'
      });
      return EMPTY_RESULT;
    }

    const reportUrl = `${THINKHAZARD_API_BASE}/report/${adminId}.json`;
    const body = await fetchJsonWithRetry(
      reportUrl,
      { cache: 'no-store', signal: controller.signal, headers: { Accept: 'application/json' } },
      { fetcher: options?.fetcher }
    );
    const hazards = parseHazardReport(body);
    return buildResult(hazards);
  } catch (error) {
    logger.warn('thinkhazard_fetch_failed', {
      error: error instanceof Error ? error.message : String(error)
    });
    return EMPTY_RESULT;
  } finally {
    clearTimeout(timer);
  }
}
