/**
 * H3 spatial-grid layer — the "common graph paper" that ties our heterogeneous
 * data sources (point comps, region rents, parcel land price, scalar POI /
 * hazard / carbon scores) to a single Uber-H3 hexagonal grid so they can be
 * joined, aggregated, and scored around an asset.
 *
 * Why H3: every connector returns a different geography (a transaction is a
 * point, R-ONE rent is a region, 공시지가 is a parcel, a hazard level is an
 * admin area). Snapping everything to one hex grid lets us (a) build a
 * distance-weighted *catchment* around the subject and (b) emit map-ready
 * per-cell keys for heatmaps — worldwide, identically.
 *
 * Pure + dependency-light (only `h3-js`): no network, no Prisma, no env. The
 * analyzer fetches the signals via the connectors, then hands them here.
 */

import {
  latLngToCell,
  cellToLatLng,
  gridDisk,
  gridDistance,
  getResolution,
  greatCircleDistance,
  UNITS
} from 'h3-js';

/**
 * Default H3 resolution. Res 9 ≈ 174 m hex edge (~0.1 km² cell) — roughly a
 * city block, the right grain for an urban CRE/DC catchment. Lower = coarser.
 */
export const DEFAULT_H3_RESOLUTION = 9;

export type GeoPoint = { latitude: number; longitude: number };
export type ValuedPoint = GeoPoint & { value: number };

/** Snap a coordinate to its H3 cell at the given resolution. */
export function toH3Cell(point: GeoPoint, resolution: number = DEFAULT_H3_RESOLUTION): string {
  return latLngToCell(point.latitude, point.longitude, resolution);
}

/**
 * The catchment cells around a center: the center cell plus all cells within
 * `rings` grid steps (gridDisk / k-ring). rings=0 → just the cell.
 */
export function catchmentCells(centerCell: string, rings: number): string[] {
  return gridDisk(centerCell, Math.max(0, Math.trunc(rings)));
}

export type CellBin = {
  cell: string;
  count: number;
  sum: number;
  mean: number;
  min: number;
  max: number;
};

/**
 * Bin valued points (e.g. transaction comps priced per sqm) into H3 cells.
 * Returns one aggregate per occupied cell — the building block for heatmaps.
 */
export function binValuedPoints(
  points: ValuedPoint[],
  resolution: number = DEFAULT_H3_RESOLUTION
): Map<string, CellBin> {
  const bins = new Map<string, CellBin>();
  for (const p of points) {
    if (!Number.isFinite(p.value)) continue;
    const cell = toH3Cell(p, resolution);
    const existing = bins.get(cell);
    if (!existing) {
      bins.set(cell, { cell, count: 1, sum: p.value, mean: p.value, min: p.value, max: p.value });
    } else {
      existing.count += 1;
      existing.sum += p.value;
      existing.mean = existing.sum / existing.count;
      existing.min = Math.min(existing.min, p.value);
      existing.max = Math.max(existing.max, p.value);
    }
  }
  return bins;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

export type CatchmentValueSummary = {
  /** Points that fell within the catchment rings. */
  count: number;
  median: number | null;
  mean: number | null;
  /** Inverse-ring-distance weighted mean (nearer rings weighted higher). */
  weightedMean: number | null;
  min: number | null;
  max: number | null;
};

/**
 * Summarize valued points (comps) that fall within `rings` of the subject
 * cell, with an inverse-distance ring decay so nearer comps dominate. Points
 * outside the catchment are excluded — turning a loose city-wide comp dump into
 * a defensible local comp set.
 */
export function summarizeCatchmentValues(
  subject: GeoPoint,
  points: ValuedPoint[],
  rings: number,
  resolution: number = DEFAULT_H3_RESOLUTION
): CatchmentValueSummary {
  const subjectCell = toH3Cell(subject, resolution);
  const inside: number[] = [];
  let weightedSum = 0;
  let weightTotal = 0;

  for (const p of points) {
    if (!Number.isFinite(p.value)) continue;
    const cell = toH3Cell(p, resolution);
    const dist = gridDistance(subjectCell, cell);
    if (dist < 0 || dist > rings) continue; // outside catchment (or unreachable)
    inside.push(p.value);
    // Ring decay: weight 1/(1+dist) — center=1, ring1=0.5, ring2=0.33…
    const weight = 1 / (1 + dist);
    weightedSum += p.value * weight;
    weightTotal += weight;
  }

  if (inside.length === 0) {
    return { count: 0, median: null, mean: null, weightedMean: null, min: null, max: null };
  }
  return {
    count: inside.length,
    median: median(inside),
    mean: inside.reduce((s, v) => s + v, 0) / inside.length,
    weightedMean: weightTotal > 0 ? weightedSum / weightTotal : null,
    min: Math.min(...inside),
    max: Math.max(...inside)
  };
}

/** Approx great-circle distance (km) between two coordinates via H3. */
export function distanceKm(a: GeoPoint, b: GeoPoint): number {
  return greatCircleDistance([a.latitude, a.longitude], [b.latitude, b.longitude], UNITS.km);
}

// ---------------------------------------------------------------------------
// Site spatial context — the unified assembler
// ---------------------------------------------------------------------------

/** Scalar signals already measured at (or for) the subject location. */
export type ScalarSiteSignals = {
  /** Overpass amenity/walkability score 0–100. */
  amenityScore?: number | null;
  /** ThinkHazard site-risk score 0–100 (higher = riskier). */
  hazardScore?: number | null;
  /** Grid carbon intensity gCO2/kWh (ElectricityMaps). */
  carbonIntensityGco2PerKwh?: number | null;
  /** Official land price KRW/㎡ (V-World 공시지가). */
  landPriceKrwPerSqm?: number | null;
  /** Submarket rent KRW/㎡ (R-ONE region). */
  submarketRentKrwPerSqm?: number | null;
  /** Submarket cap rate % (R-ONE 소득수익률). */
  submarketCapRatePct?: number | null;
};

export type SiteSpatialContext = {
  /** The subject's H3 cell — a stable, map-ready key for heatmaps. */
  cell: string;
  resolution: number;
  centroid: { latitude: number; longitude: number };
  /** Number of catchment rings included. */
  rings: number;
  catchmentCellCount: number;
  /** Distance-weighted comp summary within the catchment (e.g. KRW/㎡). */
  comps: CatchmentValueSummary;
  signals: ScalarSiteSignals;
};

export type BuildSiteContextInput = {
  subject: GeoPoint;
  /** Transaction comps as priced points (e.g. price per sqm). */
  comps?: ValuedPoint[];
  signals?: ScalarSiteSignals;
  resolution?: number;
  /** Catchment radius in rings (default 2 ≈ ~0.8–1.0 km at res 9). */
  rings?: number;
};

/**
 * Assemble a unified, H3-keyed spatial context for a subject asset: its cell,
 * the catchment-filtered + distance-weighted comp summary, and the scalar
 * environmental/market signals attached. This is what downstream valuation /
 * scoring consumes instead of raw, geographically-mismatched feeds.
 */
export function buildSiteSpatialContext(input: BuildSiteContextInput): SiteSpatialContext {
  const resolution = input.resolution ?? DEFAULT_H3_RESOLUTION;
  const rings = input.rings ?? 2;
  const cell = toH3Cell(input.subject, resolution);
  const [lat, lng] = cellToLatLng(cell);
  return {
    cell,
    resolution: getResolution(cell),
    centroid: { latitude: lat, longitude: lng },
    rings,
    catchmentCellCount: catchmentCells(cell, rings).length,
    comps: summarizeCatchmentValues(input.subject, input.comps ?? [], rings, resolution),
    signals: input.signals ?? {}
  };
}
