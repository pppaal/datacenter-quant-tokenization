/**
 * Classifies a parcel into an AssetClass based on zoning + building main-use,
 * and produces a ranked list of viable secondary uses.
 *
 * Korean zoning rules (도시계획법 시행령):
 *   중심/일반상업 → OFFICE / RETAIL (high FAR)
 *   준공업        → DATA_CENTER (possible) / INDUSTRIAL / mixed
 *   일반/전용공업  → INDUSTRIAL / DATA_CENTER (if power available)
 *   계획관리      → LOGISTICS / DATA_CENTER (non-urban belt)
 *   주거          → MULTIFAMILY (apartment development)
 */

import { AssetClass } from '@prisma/client';
import type {
  BuildingRecord,
  KoreaZoningCode,
  UseZone
} from '@/lib/services/public-data/types';

export type AssetClassCandidate = {
  assetClass: AssetClass;
  feasibility: 'PRIMARY' | 'VIABLE' | 'REQUIRES_REZONING' | 'EXCLUDED';
  rationale: string;
  confidence: number; // 0..1
};

export type ClassificationResult = {
  primary: AssetClassCandidate;
  alternatives: AssetClassCandidate[];
  dominantUse: string; // main use verbatim
};

// Use-zone → asset-class preference map (Korean zoning regime)
const ZONING_MATRIX: Record<
  KoreaZoningCode,
  Array<{ cls: AssetClass; feasibility: AssetClassCandidate['feasibility']; score: number }>
> = {
  COMMERCIAL_CENTRAL: [
    { cls: AssetClass.OFFICE, feasibility: 'PRIMARY', score: 0.95 },
    { cls: AssetClass.RETAIL, feasibility: 'VIABLE', score: 0.85 },
    { cls: AssetClass.MIXED_USE, feasibility: 'VIABLE', score: 0.80 },
    { cls: AssetClass.HOTEL, feasibility: 'VIABLE', score: 0.60 },
    { cls: AssetClass.DATA_CENTER, feasibility: 'EXCLUDED', score: 0.05 }
  ],
  COMMERCIAL_GENERAL: [
    { cls: AssetClass.OFFICE, feasibility: 'PRIMARY', score: 0.85 },
    { cls: AssetClass.RETAIL, feasibility: 'PRIMARY', score: 0.85 },
    { cls: AssetClass.MIXED_USE, feasibility: 'VIABLE', score: 0.75 },
    { cls: AssetClass.MULTIFAMILY, feasibility: 'VIABLE', score: 0.50 },
    { cls: AssetClass.DATA_CENTER, feasibility: 'EXCLUDED', score: 0.05 }
  ],
  COMMERCIAL_NEIGHBORHOOD: [
    { cls: AssetClass.RETAIL, feasibility: 'PRIMARY', score: 0.85 },
    { cls: AssetClass.MIXED_USE, feasibility: 'VIABLE', score: 0.65 },
    { cls: AssetClass.OFFICE, feasibility: 'VIABLE', score: 0.55 },
    { cls: AssetClass.HOTEL, feasibility: 'VIABLE', score: 0.45 }
  ],
  COMMERCIAL_DISTRIBUTION: [
    { cls: AssetClass.INDUSTRIAL, feasibility: 'PRIMARY', score: 0.80 },
    { cls: AssetClass.RETAIL, feasibility: 'VIABLE', score: 0.50 }
  ],
  INDUSTRIAL_EXCLUSIVE: [
    { cls: AssetClass.INDUSTRIAL, feasibility: 'PRIMARY', score: 0.90 },
    { cls: AssetClass.DATA_CENTER, feasibility: 'VIABLE', score: 0.70 }
  ],
  INDUSTRIAL_GENERAL: [
    { cls: AssetClass.INDUSTRIAL, feasibility: 'PRIMARY', score: 0.85 },
    { cls: AssetClass.DATA_CENTER, feasibility: 'VIABLE', score: 0.80 }
  ],
  INDUSTRIAL_QUASI: [
    { cls: AssetClass.OFFICE, feasibility: 'PRIMARY', score: 0.75 },
    { cls: AssetClass.INDUSTRIAL, feasibility: 'VIABLE', score: 0.70 },
    { cls: AssetClass.DATA_CENTER, feasibility: 'VIABLE', score: 0.65 },
    { cls: AssetClass.MIXED_USE, feasibility: 'VIABLE', score: 0.60 }
  ],
  RESIDENTIAL_1: [
    { cls: AssetClass.MULTIFAMILY, feasibility: 'PRIMARY', score: 0.80 },
    { cls: AssetClass.RETAIL, feasibility: 'EXCLUDED', score: 0.10 }
  ],
  RESIDENTIAL_2: [
    { cls: AssetClass.MULTIFAMILY, feasibility: 'PRIMARY', score: 0.85 },
    { cls: AssetClass.RETAIL, feasibility: 'REQUIRES_REZONING', score: 0.15 }
  ],
  RESIDENTIAL_3: [
    { cls: AssetClass.MULTIFAMILY, feasibility: 'PRIMARY', score: 0.90 },
    { cls: AssetClass.OFFICE, feasibility: 'REQUIRES_REZONING', score: 0.20 }
  ],
  MANAGEMENT_PLAN: [
    { cls: AssetClass.INDUSTRIAL, feasibility: 'PRIMARY', score: 0.75 },
    { cls: AssetClass.DATA_CENTER, feasibility: 'PRIMARY', score: 0.85 },
    { cls: AssetClass.LAND, feasibility: 'VIABLE', score: 0.50 }
  ],
  MANAGEMENT_PRODUCTION: [
    { cls: AssetClass.INDUSTRIAL, feasibility: 'VIABLE', score: 0.60 },
    { cls: AssetClass.LAND, feasibility: 'VIABLE', score: 0.50 }
  ],
  MANAGEMENT_CONSERVATION: [
    { cls: AssetClass.LAND, feasibility: 'VIABLE', score: 0.40 }
  ],
  GREEN_PRESERVATION: [{ cls: AssetClass.LAND, feasibility: 'EXCLUDED', score: 0.10 }],
  GREEN_PRODUCTION: [{ cls: AssetClass.LAND, feasibility: 'VIABLE', score: 0.30 }],
  GREEN_NATURAL: [{ cls: AssetClass.LAND, feasibility: 'EXCLUDED', score: 0.10 }],
  AGRICULTURE: [{ cls: AssetClass.LAND, feasibility: 'VIABLE', score: 0.35 }],
  NATURE_RESERVE: [{ cls: AssetClass.LAND, feasibility: 'EXCLUDED', score: 0.05 }],
  UNKNOWN: [{ cls: AssetClass.OFFICE, feasibility: 'VIABLE', score: 0.50 }]
};

// Main-use string → strong signal for current asset class
const MAIN_USE_HINTS: Array<{ pattern: RegExp; cls: AssetClass }> = [
  { pattern: /업무시설|오피스/, cls: AssetClass.OFFICE },
  { pattern: /판매시설|근린생활/, cls: AssetClass.RETAIL },
  { pattern: /공동주택|아파트|다세대|다가구/, cls: AssetClass.MULTIFAMILY },
  { pattern: /숙박|호텔|관광/, cls: AssetClass.HOTEL },
  { pattern: /공장|창고|물류/, cls: AssetClass.INDUSTRIAL },
  { pattern: /발전|전기|전산/, cls: AssetClass.DATA_CENTER }
];

function buildRationale(
  zone: UseZone,
  candidate: { cls: AssetClass; feasibility: AssetClassCandidate['feasibility'] },
  mainUse: string
): string {
  const useNote = mainUse ? ` 현재 주용도: "${mainUse}".` : '';
  switch (candidate.feasibility) {
    case 'PRIMARY':
      return `${zone.primaryZone}에 최적합 용도 (${candidate.cls}).${useNote}`;
    case 'VIABLE':
      return `${zone.primaryZone}에서 ${candidate.cls} 개발 가능 (조건부).${useNote}`;
    case 'REQUIRES_REZONING':
      return `${zone.primaryZone} 기준 ${candidate.cls} 사용은 용도변경 필요.${useNote}`;
    case 'EXCLUDED':
      return `${zone.primaryZone}는 ${candidate.cls} 개발 불가.${useNote}`;
  }
}

export function classifyAsset(
  zone: UseZone,
  building: BuildingRecord | null
): ClassificationResult {
  const mainUse = building?.mainUse ?? '';
  const source = ZONING_MATRIX[zone.zoningCode] ?? ZONING_MATRIX.UNKNOWN;
  const candidates = source.map((c) => ({ ...c }));

  // Boost candidate whose class matches the current building's main-use.
  const hint = MAIN_USE_HINTS.find((h) => h.pattern.test(mainUse));
  if (hint) {
    const match = candidates.find((c) => c.cls === hint.cls);
    if (match) {
      match.score = Math.min(1, match.score + 0.1);
    } else {
      candidates.push({ cls: hint.cls, feasibility: 'VIABLE', score: 0.55 });
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  const [first, ...rest] = candidates;
  const primary: AssetClassCandidate = {
    assetClass: first!.cls,
    feasibility: first!.feasibility,
    rationale: buildRationale(zone, first!, mainUse),
    confidence: first!.score
  };
  const alternatives: AssetClassCandidate[] = rest.map((c) => ({
    assetClass: c.cls,
    feasibility: c.feasibility,
    rationale: buildRationale(zone, c, mainUse),
    confidence: c.score
  }));

  return {
    primary,
    alternatives,
    dominantUse: mainUse
  };
}
