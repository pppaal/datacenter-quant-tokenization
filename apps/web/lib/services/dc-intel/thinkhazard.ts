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

import { env } from '@/lib/env';
import { fetchJsonWithRetry, type Fetcher } from '@/lib/sources/http';
import { logger } from '@/lib/observability/logger';
import { clamp } from '@/lib/math';

export const THINKHAZARD_API_BASE = env().THINKHAZARD_API_BASE?.trim() || 'https://thinkhazard.org';

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

// ThinkHazard's public API only reports by division code (`adminId`); it has no
// coordinate lookup (see `fetchSiteHazards`). Coordinates are still accepted for
// caller convenience but resolve to an empty result until an `adminId` is given.
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
  return env().ENABLE_THINKHAZARD;
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

function buildResult(hazards: SiteHazard[]): SiteHazardsResult {
  return {
    hazards,
    overallRiskScore: scoreSiteHazards(hazards),
    highRiskHazards: hazards.filter((h) => h.level === 'High').map((h) => h.hazardType),
    source: THINKHAZARD_SOURCE
  };
}

/**
 * Fetch classified natural-hazard levels and a bounded site-risk score for a
 * ThinkHazard admin division id (`adminId`). Coordinate input is not supported
 * by the public API and resolves to an empty result.
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

  const hasAdminId = typeof input.adminId === 'number' && Number.isFinite(input.adminId);

  if (!hasAdminId) {
    // ThinkHazard's public API has NO coordinate→division lookup (confirmed in
    // its API.md). The `/administrativedivision` route is a name autocomplete
    // that requires a `q` text parameter, not lat/lng — calling it with
    // coordinates returns HTTP 400. Callers must resolve a ThinkHazard division
    // code out-of-band (e.g. from a GAUL/admin-boundary dataset) and pass it as
    // `adminId`. We fail soft to empty rather than make a doomed request.
    logger.debug('thinkhazard_requires_admin_code', {
      reason: 'public API has no coordinate lookup; pass adminId (division code)'
    });
    return EMPTY_RESULT;
  }

  const adminId = input.adminId as number;
  const timeoutMs = options?.timeoutMs ?? 8_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
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
