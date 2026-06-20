/**
 * KDS 17 10 00 seismic-zone lookup — Korea design-basis ground motion.
 *
 * Korea's seismic-design standard (KDS 17 10 00, 내진설계기준 일반) assigns every
 * administrative district to one of two seismic zones (지진구역) and gives each a
 * zone factor (지진구역계수 Z) equal to the effective horizontal ground
 * acceleration of a 500-year-return-period earthquake on bedrock, in units of g:
 *
 *     지진구역 I  → Z = 0.11g   (대부분의 행정구역)
 *     지진구역 II → Z = 0.07g   (강원 북부 일부 · 전남 남서부 일부 · 제주 전역)
 *
 * The design ground motion at any other return period is Z × I, where I is the
 * risk coefficient (위험도계수) from KDS 17 10 00 Table 4.2-3:
 *
 *     재현주기(년)   50    100   200   500   1000  2400
 *     위험도계수 I  0.40  0.57  0.73  1.00  1.40  2.00
 *
 * This module is a KEYLESS, PURE, DETERMINISTIC lookup — it encodes the
 * published statutory table, makes no network call, and reads no env. It
 * replaces the seeded 0–5 seismic-hazard score with a defensible,
 * standard-grounded reading: the seismic zone, the zone factor, the full
 * design-PGA-by-return-period curve, and a bounded 0–5 screening score that
 * stays comparable with the other site-hazard scores.
 *
 * Source / attribution: 국토교통부 고시 KDS 17 10 00 내진설계기준(일반). The
 * zone→district assignment below is the §4.2 행정구역별 지진구역 table.
 */

import { clamp, round } from '@/lib/math';

export const KDS_SEISMIC_SOURCE = 'KDS 17 10 00 내진설계기준 (국토교통부)';

export type SeismicZone = 'I' | 'II';

/**
 * 지진구역계수 Z — the 500-year effective horizontal ground acceleration on
 * bedrock for each zone, in units of g. (KDS 17 10 00 Table 4.2-1.)
 */
export const ZONE_FACTOR_G: Record<SeismicZone, number> = {
  I: 0.11,
  II: 0.07
};

/**
 * 위험도계수 I by mean return period (KDS 17 10 00 Table 4.2-3). The design
 * ground motion at a return period is `ZONE_FACTOR_G[zone] * RISK_COEFFICIENT`.
 */
export const RISK_COEFFICIENT_BY_RETURN_PERIOD: Record<number, number> = {
  50: 0.4,
  100: 0.57,
  200: 0.73,
  500: 1.0,
  1000: 1.4,
  2400: 2.0
};

/** Return periods (years), ascending, that KDS 17 10 00 tabulates. */
export const STANDARD_RETURN_PERIODS = [50, 100, 200, 500, 1000, 2400] as const;

/**
 * 지진구역 II districts (Z = 0.07g). Everything not listed here — once the
 * region is recognized as Korean — is 지진구역 I (Z = 0.11g). Keyed by the
 * canonical short 시/도 name (see `canonicalSido`); values are the bare 시/군
 * names (no 시/군 suffix) per KDS 17 10 00 §4.2.
 *
 *   - 강원: 북부 11개 시·군 (춘천·홍천·횡성·평창·철원·화천·양구·인제·고성·양양·속초).
 *           나머지 영동·남부(원주·강릉·동해·태백·삼척·영월·정선)는 구역 I.
 *   - 전남: 남서부 10개 시·군 + 목포 (강진·고흥·무안·신안·영광·영암·완도·진도·함평·해남·목포).
 *           나머지(여수·순천·나주·광양·담양·곡성·구례·보성·화순·장흥·장성)는 구역 I.
 */
const ZONE_II_DISTRICTS: Record<string, ReadonlySet<string>> = {
  강원: new Set([
    '춘천',
    '홍천',
    '횡성',
    '평창',
    '철원',
    '화천',
    '양구',
    '인제',
    '고성',
    '양양',
    '속초'
  ]),
  전남: new Set([
    '강진',
    '고흥',
    '무안',
    '신안',
    '영광',
    '영암',
    '완도',
    '진도',
    '함평',
    '해남',
    '목포'
  ])
};

/** 시/도 that are 지진구역 II in their entirety. */
const ZONE_II_WHOLE_SIDO: ReadonlySet<string> = new Set(['제주']);

/**
 * The 17 Korean 시/도, canonicalized to a short key. Used both to recognize a
 * region as Korean (so we can default it to 구역 I) and to key the Zone-II
 * district table. Aliases cover the full legal names and the 특별자치도 renames.
 */
const SIDO_ALIASES: Record<string, string> = {
  서울: '서울',
  서울특별시: '서울',
  부산: '부산',
  부산광역시: '부산',
  대구: '대구',
  대구광역시: '대구',
  인천: '인천',
  인천광역시: '인천',
  광주: '광주',
  광주광역시: '광주',
  대전: '대전',
  대전광역시: '대전',
  울산: '울산',
  울산광역시: '울산',
  세종: '세종',
  세종특별자치시: '세종',
  경기: '경기',
  경기도: '경기',
  강원: '강원',
  강원도: '강원',
  강원특별자치도: '강원',
  충북: '충북',
  충청북도: '충북',
  충남: '충남',
  충청남도: '충남',
  전북: '전북',
  전라북도: '전북',
  전북특별자치도: '전북',
  전남: '전남',
  전라남도: '전남',
  경북: '경북',
  경상북도: '경북',
  경남: '경남',
  경상남도: '경남',
  제주: '제주',
  제주도: '제주',
  제주특별자치도: '제주'
};

export type SeismicZoneInput = {
  /** 시/도 (e.g. "강원특별자치도", "전라남도"). */
  province?: string | null;
  /** 시/군/구 (e.g. "춘천시", "해남군"). */
  city?: string | null;
  /** Alternate 시/군/구 field. */
  district?: string | null;
  /** Full address; parsed for 시/도 + 시/군 when province/city are absent. */
  address?: string | null;
};

/** How confidently the zone was resolved. */
export type SeismicZoneMatch =
  | 'sigungu' // matched a specific 시/군 (the most precise the table allows)
  | 'sido' // matched at the 시/도 level (e.g. 제주 전역, or a metro 시/도)
  | 'default'; // recognized as Korean but no 시/군 signal → defaulted to 구역 I

export type SeismicPgaPoint = {
  returnPeriodYears: number;
  riskCoefficient: number;
  /** Design effective horizontal ground acceleration, g (Z × I). */
  pgaG: number;
};

export type SeismicSiteResult = {
  zone: SeismicZone;
  /** 지진구역계수 Z, g. */
  zoneFactorG: number;
  match: SeismicZoneMatch;
  canonicalSido: string;
  matchedDistrict: string | null;
  /** Full Z × I curve over the tabulated return periods. */
  pgaByReturnPeriod: SeismicPgaPoint[];
  /**
   * Bounded 0–5 screening score, comparable with the other site-hazard scores
   * (see `lib/services/im/hazard.ts`). A proxy for display; the engineering
   * truth is `zoneFactorG` / `pgaByReturnPeriod`.
   */
  hazardScore: number;
  source: string;
};

function stripSuffix(value: string): string {
  // Drop a single trailing administrative suffix so "춘천시" → "춘천",
  // "해남군" → "해남", "수원시" → "수원". 구/특별자치도 etc. are handled by
  // the alias table for 시/도; for 시/군 only 시·군 suffixes occur.
  return value.replace(/(특별자치도|특별자치시|특별시|광역시|자치도|자치시|시|군|구|도)$/u, '');
}

/** Canonicalize a raw 시/도 string to a short key, or null if not recognized. */
export function canonicalSido(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (SIDO_ALIASES[trimmed]) return SIDO_ALIASES[trimmed];
  const stripped = stripSuffix(trimmed);
  return SIDO_ALIASES[stripped] ?? null;
}

/**
 * Parse a 시/도 and a candidate 시/군 token out of the input. `province`/`city`
 * take precedence; otherwise the first whitespace token of `address` is treated
 * as the 시/도 and the second as the 시/군 (Korean addresses read big→small).
 */
function parseRegion(input: SeismicZoneInput): { sido: string | null; sigungu: string | null } {
  let sidoRaw = input.province ?? null;
  let sigunguRaw = input.city ?? input.district ?? null;

  if ((!sidoRaw || !sigunguRaw) && input.address) {
    const tokens = input.address.trim().split(/\s+/u);
    if (!sidoRaw && tokens[0]) sidoRaw = tokens[0];
    if (!sigunguRaw && tokens[1]) sigunguRaw = tokens[1];
  }

  return {
    sido: canonicalSido(sidoRaw),
    sigungu: sigunguRaw ? stripSuffix(sigunguRaw.trim()) : null
  };
}

/**
 * Screening 0–5 seismic score per zone, anchored so it lands in the same band
 * space as the rest of the site-hazard scores (`classifyHazardScore`: <0.5
 * minimal, <1 low, <2 moderate, <3 elevated, ≥3 high):
 *
 *   지진구역 II (0.07g) → 1.0  (low–moderate)
 *   지진구역 I  (0.11g) → 1.8  (moderate)
 *
 * Korea is a low-to-moderate-seismicity country, so neither zone reaches the
 * "elevated"/"high" bands. The score is a bounded display proxy; size reserves
 * and resilience off `zoneFactorG` / `pgaByReturnPeriod`, not this number.
 */
const ZONE_SCREENING_SCORE: Record<SeismicZone, number> = {
  I: 1.8,
  II: 1.0
};

/** Design PGA (g) at one return period for a zone: Z × I. */
export function effectiveGroundAccelerationG(zone: SeismicZone, returnPeriodYears = 500): number {
  const risk = RISK_COEFFICIENT_BY_RETURN_PERIOD[returnPeriodYears];
  if (risk === undefined) {
    throw new Error(`unsupported_return_period:${returnPeriodYears}`);
  }
  return round(ZONE_FACTOR_G[zone] * risk, 4);
}

/** Full Z × I curve over the tabulated return periods. */
export function seismicPgaByReturnPeriod(zone: SeismicZone): SeismicPgaPoint[] {
  return STANDARD_RETURN_PERIODS.map((returnPeriodYears) => ({
    returnPeriodYears,
    riskCoefficient: RISK_COEFFICIENT_BY_RETURN_PERIOD[returnPeriodYears],
    pgaG: effectiveGroundAccelerationG(zone, returnPeriodYears)
  }));
}

/** 0–5 screening score for a zone (see `ZONE_SCREENING_SCORE`). */
export function seismicHazardScore(zone: SeismicZone): number {
  return clamp(ZONE_SCREENING_SCORE[zone], 0, 5);
}

/**
 * Resolve the KDS 17 10 00 seismic zone for a Korean site. Returns `null` only
 * when the region cannot be recognized as Korean (no usable 시/도) — in that
 * case the caller should fall back rather than assume a zone.
 */
export function resolveSeismicZone(input: SeismicZoneInput): SeismicSiteResult | null {
  const { sido, sigungu } = parseRegion(input);
  if (!sido) return null;

  let zone: SeismicZone = 'I';
  let match: SeismicZoneMatch;
  let matchedDistrict: string | null = null;

  if (ZONE_II_WHOLE_SIDO.has(sido)) {
    zone = 'II';
    match = 'sido';
  } else if (sigungu && ZONE_II_DISTRICTS[sido]?.has(sigungu)) {
    zone = 'II';
    match = 'sigungu';
    matchedDistrict = sigungu;
  } else if (sigungu) {
    // Recognized 시/도 + a 시/군 that isn't on the Zone-II list → 구역 I, and we
    // know it at district precision (most of 강원/전남 plus every 시/군 of the
    // other 시/도 fall here).
    zone = 'I';
    match = ZONE_II_DISTRICTS[sido] ? 'sigungu' : 'sido';
    matchedDistrict = ZONE_II_DISTRICTS[sido] ? sigungu : null;
  } else {
    // 시/도 only. For 강원/전남 that's ambiguous between zones, but the standard
    // assigns the majority to 구역 I, so default there; flag the lower
    // precision via `match`.
    zone = 'I';
    match = 'default';
  }

  return {
    zone,
    zoneFactorG: ZONE_FACTOR_G[zone],
    match,
    canonicalSido: sido,
    matchedDistrict,
    pgaByReturnPeriod: seismicPgaByReturnPeriod(zone),
    hazardScore: seismicHazardScore(zone),
    source: KDS_SEISMIC_SOURCE
  };
}
