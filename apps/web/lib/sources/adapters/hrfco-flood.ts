/**
 * 한강홍수통제소 (HRFCO) 빈도별 침수심 통계 connector.
 *
 * data.go.kr/15141709 — 유역별 빈도별 국가하천 하천범람 지도 침수심 통계.
 * For each river basin and return-period frequency (100 / 200 / 500 년 +
 * 기왕최대), the 홍수위험지도 reports the inundation AREA (km²) in five depth
 * bands: ≤0.5m, 0.5–1.0m, 1.0–2.0m, 2.0–5.0m, ≥5.0m. (A sibling dataset,
 * 15141717, carries the urban-flood map on the same shape.)
 *
 * This grounds the otherwise-seeded `SiteProfile.floodRiskScore`: from the
 * depth-band areas we derive a bounded 0–5 flood-severity score (deeper bands
 * weighted more heavily), so a basin whose flooded footprint is dominated by
 * deep water scores higher than one that only ever floods shallowly.
 *
 * Conventions match the other free-key data.go.kr adapters (kpx-smp,
 * live/rtms): injectable `Fetcher`, DECODING-form `serviceKey`, gated on
 * `HRFCO_FLOOD_SERVICE_KEY`, fail-closed (no key / error ⇒ empty result + note,
 * never throws). Tolerant XML parsing isolated in `parseFloodDepthStats`.
 *
 * SCAFFOLD-PARITY CAVEAT: confirm the item tag names and the basin-code
 * parameter against one live sample before trusting absolute areas. The depth
 * bands themselves are fixed by the standard; the score weighting is a
 * documented, monotonic placeholder.
 */

import { fetchTextWithRetry, type Fetcher } from '@/lib/sources/http';
import { logger } from '@/lib/observability/logger';
import { clamp } from '@/lib/math';

export const HRFCO_FLOOD_SOURCE = '한강홍수통제소 침수심 통계 (data.go.kr/15141709)';
const HRFCO_FLOOD_ENDPOINT_DEFAULT =
  'https://apis.data.go.kr/B500001/floodDepthStat/getFloodDepthStat';

/** The five fixed 침수심 (inundation-depth) bands, shallow→deep. */
export const FLOOD_DEPTH_BANDS = [
  { key: 'd0_5', label: '≤0.5m', upperBoundM: 0.5, severity: 1 },
  { key: 'd0_5_1', label: '0.5–1.0m', upperBoundM: 1.0, severity: 2 },
  { key: 'd1_2', label: '1.0–2.0m', upperBoundM: 2.0, severity: 3 },
  { key: 'd2_5', label: '2.0–5.0m', upperBoundM: 5.0, severity: 4 },
  { key: 'd5_plus', label: '≥5.0m', upperBoundM: null, severity: 5 }
] as const;

export type FloodDepthAreas = Record<(typeof FLOOD_DEPTH_BANDS)[number]['key'], number>;

export type FloodBasinStat = {
  /** Basin code/name as the API reports it. */
  basin: string;
  /** '100' | '200' | '500' | 'max' (기왕최대). */
  frequency: string;
  areasKm2: FloodDepthAreas;
  totalAreaKm2: number;
  /**
   * Bounded 0–5 flood-severity score: area-weighted mean band severity, where
   * the bands carry severity 1..5. An all-deep basin → 5; an all-shallow basin
   * → 1; no flooded area → 0. Comparable with the other site-hazard scores.
   */
  floodScore: number;
};

export type HrfcoFloodResult = {
  source: string;
  stats: FloodBasinStat[];
  fetchedAt: Date;
  error: string | null;
};

function isEnabled(): boolean {
  return Boolean(process.env.HRFCO_FLOOD_SERVICE_KEY);
}

function readField(block: string, ...tagNames: string[]): string | null {
  for (const tag of tagNames) {
    const m = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(block);
    if (m) return m[1]!.trim();
  }
  return null;
}

function num(value: string | null): number {
  if (value === null) return 0;
  const n = Number(value.replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

function normalizeFrequency(raw: string | null): string {
  if (!raw) return 'unknown';
  const t = raw.trim();
  if (/기왕|최대|max/i.test(t)) return 'max';
  const m = /(\d+)/.exec(t);
  return m ? m[1]! : t;
}

/** Area-weighted mean band severity, bounded to [0, 5]. Exported for testing. */
export function floodScoreFromAreas(areas: FloodDepthAreas): number {
  let weighted = 0;
  let total = 0;
  for (const band of FLOOD_DEPTH_BANDS) {
    const area = areas[band.key] ?? 0;
    weighted += area * band.severity;
    total += area;
  }
  if (total === 0) return 0;
  return Math.round(clamp(weighted / total, 0, 5) * 10) / 10;
}

/** Parse a HRFCO depth-stat XML body into per-basin/frequency stats. */
export function parseFloodDepthStats(xml: string): FloodBasinStat[] {
  const stats: FloodBasinStat[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match: RegExpExecArray | null;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1]!;
    const basin = readField(block, 'wtrshedNm', 'basinNm', 'basin', '유역명') ?? 'unknown';
    const frequency = normalizeFrequency(
      readField(block, 'frqncyNm', 'frequency', 'rtrnPrd', '빈도')
    );
    const areasKm2: FloodDepthAreas = {
      d0_5: num(readField(block, 'area05Under', 'depth05', 'd05', '침수심0_5이하')),
      d0_5_1: num(readField(block, 'area0510', 'depth0510', 'd0510', '침수심0_5_1_0')),
      d1_2: num(readField(block, 'area1020', 'depth1020', 'd1020', '침수심1_0_2_0')),
      d2_5: num(readField(block, 'area2050', 'depth2050', 'd2050', '침수심2_0_5_0')),
      d5_plus: num(readField(block, 'area50Over', 'depth50', 'd50', '침수심5_0이상'))
    };
    const totalAreaKm2 =
      Math.round(Object.values(areasKm2).reduce((s, v) => s + v, 0) * 1_000_000) / 1_000_000;
    stats.push({
      basin,
      frequency,
      areasKm2,
      totalAreaKm2,
      floodScore: floodScoreFromAreas(areasKm2)
    });
  }
  return stats;
}

/** Fetch HRFCO flood-depth stats. Fails closed (empty + note, never throws). */
export async function fetchFloodDepthStats(options?: {
  /** Basin code; omitted ⇒ the dataset's default page. */
  basinCode?: string;
  numOfRows?: number;
  fetcher?: Fetcher;
}): Promise<HrfcoFloodResult> {
  const fetchedAt = new Date();
  if (!isEnabled()) {
    return {
      source: HRFCO_FLOOD_SOURCE,
      stats: [],
      fetchedAt,
      error: 'HRFCO_FLOOD_SERVICE_KEY not set'
    };
  }

  const endpoint = process.env.HRFCO_FLOOD_API_URL?.trim() || HRFCO_FLOOD_ENDPOINT_DEFAULT;
  const url = new URL(endpoint);
  url.searchParams.set('serviceKey', process.env.HRFCO_FLOOD_SERVICE_KEY!);
  url.searchParams.set('numOfRows', String(options?.numOfRows ?? 100));
  url.searchParams.set('pageNo', '1');
  url.searchParams.set('dataType', 'XML');
  if (options?.basinCode) url.searchParams.set('wtrshedCd', options.basinCode);

  try {
    const xml = await fetchTextWithRetry(
      url.toString(),
      { cache: 'no-store' },
      {
        fetcher: options?.fetcher
      }
    );
    const stats = parseFloodDepthStats(xml);
    return {
      source: HRFCO_FLOOD_SOURCE,
      stats,
      fetchedAt,
      error: stats.length === 0 ? 'no flood-stat items in response' : null
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    logger.warn('hrfco_flood_fetch_failed', { error: message });
    return {
      source: HRFCO_FLOOD_SOURCE,
      stats: [],
      fetchedAt,
      error: `HRFCO flood fetch failed: ${message}`
    };
  }
}
