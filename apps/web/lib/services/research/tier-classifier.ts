/**
 * Asset-tier classifier for cap-rate aggregator buckets.
 *
 * Korean commercial real-estate research distinguishes
 * Prime / Grade A / Grade B / Strata (구분) office, plus
 * Premium / Standard logistics for industrial. Our intake stores a
 * free-text `comparableType` (e.g. "Office Prime", "Class A office",
 * "오피스 A급") and, for transactions tied to one of our underwritten
 * assets, a buildingSnapshot with redundancy-tier / floor-area
 * metadata. This module turns those signals into a normalized
 * `assetTier` string the aggregator groups on.
 *
 * Conservative on purpose: when the inputs don't strongly indicate a
 * tier, returns null. Better an "Untiered" bucket than a wrong
 * classification driving a CBRE-style matrix.
 */
import { AssetClass } from '@prisma/client';

export type AssetTier = 'PRIME' | 'GRADE_A' | 'GRADE_B' | 'STRATA' | 'PREMIUM' | 'STANDARD' | 'TIER_III' | 'TIER_II';

export type TierClassifierInput = {
  /** Free-text from intake (e.g. comparableType). */
  comparableType?: string | null;
  /** Asset class context — different rules for office vs industrial vs DC. */
  assetClass?: AssetClass | null;
  /** GFA in sqm for office tier-by-size hints. */
  grossFloorAreaSqm?: number | null;
  /** DC redundancy tier label from buildingSnapshot. */
  redundancyTier?: string | null;
  /** Building age years; newer assets bias upward. */
  ageYears?: number | null;
};

const PRIME_PATTERNS = [/prime/i, /\bAAA\b/, /프라임/];
const GRADE_A_PATTERNS = [/\bgrade\s*a\b/i, /\bclass\s*a\b/i, /\bA[\s-]?(?:급|class|grade)\b/i, /오피스\s*A급/];
const GRADE_B_PATTERNS = [/\bgrade\s*b\b/i, /\bclass\s*b\b/i, /\bB[\s-]?(?:급|class|grade)\b/i];
const STRATA_PATTERNS = [/\bstrata\b/i, /구분소유/, /구분\s*오피스/];
const PREMIUM_PATTERNS = [/premium/i, /프리미엄/];
const STANDARD_PATTERNS = [/standard/i, /일반\s*물류/];
const TIER_III_PATTERNS = [/tier\s*(?:iii|3)\+?/i];
const TIER_II_PATTERNS = [/tier\s*(?:ii|2)\b/i];

function matches(text: string, patterns: RegExp[]): boolean {
  return patterns.some((re) => re.test(text));
}

/**
 * Classify a row into a tier bucket. Inputs are merged: the free-text
 * comparableType is checked first (most specific signal), then asset
 * class + structural attributes are used as fallback heuristics.
 */
export function classifyAssetTier(input: TierClassifierInput): AssetTier | null {
  const text = [input.comparableType, input.redundancyTier].filter(Boolean).join(' ').trim();
  if (text) {
    if (matches(text, PRIME_PATTERNS)) return 'PRIME';
    if (matches(text, GRADE_A_PATTERNS)) return 'GRADE_A';
    if (matches(text, GRADE_B_PATTERNS)) return 'GRADE_B';
    if (matches(text, STRATA_PATTERNS)) return 'STRATA';
    if (matches(text, PREMIUM_PATTERNS)) return 'PREMIUM';
    if (matches(text, STANDARD_PATTERNS)) return 'STANDARD';
    if (matches(text, TIER_III_PATTERNS)) return 'TIER_III';
    if (matches(text, TIER_II_PATTERNS)) return 'TIER_II';
  }

  // Office tier-by-size fallback when no textual signal but we know
  // the class + floor area. Korean REB convention:
  //   Prime    > 50,000 sqm
  //   Grade A   25,000 – 50,000 sqm
  //   Grade B   10,000 – 25,000 sqm
  //   below     left untiered
  if (input.assetClass === AssetClass.OFFICE && typeof input.grossFloorAreaSqm === 'number') {
    if (input.grossFloorAreaSqm >= 50_000) return 'PRIME';
    if (input.grossFloorAreaSqm >= 25_000) return 'GRADE_A';
    if (input.grossFloorAreaSqm >= 10_000) return 'GRADE_B';
  }

  // DC redundancy fallback.
  if (input.assetClass === AssetClass.DATA_CENTER && input.redundancyTier) {
    if (/iii|3/i.test(input.redundancyTier)) return 'TIER_III';
    if (/ii|2/i.test(input.redundancyTier)) return 'TIER_II';
  }

  return null;
}

/** Sort order for display tables: PRIME first, untiered last. */
export const TIER_DISPLAY_ORDER: Array<AssetTier | null> = [
  'PRIME',
  'GRADE_A',
  'GRADE_B',
  'STRATA',
  'PREMIUM',
  'STANDARD',
  'TIER_III',
  'TIER_II',
  null
];
