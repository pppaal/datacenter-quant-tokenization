/**
 * Deal-screening engine — takes raw listings from upstream channels
 * (경매, 공매, NPL, off-market, broker) and scores them against a
 * sponsor's investment criteria before they enter the Deal pipeline.
 *
 * Why this exists:
 *   The existing Deal model (Prisma `Deal`) covers everything AFTER a
 *   deal has been brought in: bids, diligence, closing. But the SDCO
 *   team's bottleneck is earlier — they see dozens of auction rounds,
 *   NPL tapes, and broker emails per week and need a repeatable filter
 *   that says "worth underwriting" vs "skip." That filter is this
 *   module.
 *
 *   Korean CRE sourcing channels each have distinct economics:
 *     - 대법원 법원경매: 유찰이 반복되면서 최저입찰가가 20% 씩 내려가고,
 *       유치권·임차인 대항력 등 권리분석이 deal-killer가 된다.
 *     - KAMCO 온비드 공매: 권리관계가 상대적으로 깨끗하지만 정부기관
 *       보유 자산이라 입지가 외곽인 경우가 많다.
 *     - NPL 포트폴리오: 담보권 실행 단계에 있어 대출잔액과 담보가치의
 *       차이(LGD)가 실질 인수가격 근사치다.
 *     - Off-market / broker: 정보 비대칭이 가장 크고, 협상 여지가 크다.
 *
 *   The scorer encodes these differences so that the output ranking is
 *   not just "cheapest discount first" but "best risk-adjusted fit for
 *   THIS sponsor."
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ListingChannel =
  | 'COURT_AUCTION'
  | 'PUBLIC_DISPOSAL'
  | 'NPL_PORTFOLIO'
  | 'OFF_MARKET'
  | 'BROKER_LISTING';

export type ListingAssetClass =
  | 'OFFICE'
  | 'RETAIL'
  | 'INDUSTRIAL'
  | 'MULTIFAMILY'
  | 'HOTEL'
  | 'DATA_CENTER'
  | 'LAND'
  | 'MIXED_USE';

export type EncumbranceTag =
  | 'CLEAN_TITLE'
  | 'EXISTING_LEASE' // 임차인 있음 (통상 승계)
  | 'TENANT_OPPOSABILITY' // 임차인 대항력 (severity high)
  | 'LIEN_HOLDER_CLAIM' // 유치권 (severity high)
  | 'SECOND_LIEN' // 후순위 근저당
  | 'TAX_LIEN' // 세금 우선특권
  | 'SMALL_CLAIMS' // 소액 가압류 등
  | 'ENVIRONMENTAL_FLAG' // 토양오염 등
  | 'CONSTRUCTION_INCOMPLETE';

export type RawListing = {
  listingId: string;
  channel: ListingChannel;
  assetClass: ListingAssetClass;
  province: string;
  district: string;
  jibunAddress: string | null;
  appraisalValueKrw: number;
  minimumBidKrw: number;
  /** Number of failed auction rounds (유찰 횟수) — 0 if initial listing. */
  priorFailedRounds: number;
  eventDate: Date | null;
  gfaSqm: number | null;
  landAreaSqm: number | null;
  estimatedStabilizedNoiKrw: number | null;
  seniorDebtKrw: number | null;
  encumbrances: EncumbranceTag[];
  notes: string | null;
};

export type SponsorCriteria = {
  targetAssetClasses: ListingAssetClass[];
  minCheckSizeKrw: number;
  maxCheckSizeKrw: number;
  /** Minimum acceptable discount vs appraisal (%). */
  minDiscountPct: number;
  /** Minimum acceptable entry cap rate (%). If NOI unavailable, skipped. */
  minEntryCapRatePct: number;
  allowedChannels: ListingChannel[];
  allowedProvinces: string[];
  /** 0 = clean only; 3 = tolerates liens / 대항력. */
  maxEncumbranceSeverity: 0 | 1 | 2 | 3;
  /** Max weeks sponsor has to close from today. */
  executionSpeedWeeks: number;
};

export type ListingScore = {
  listing: RawListing;
  impliedDiscountPct: number;
  impliedEntryCapRatePct: number | null;
  impliedLtvVsSeniorPct: number | null;
  encumbranceSeverityScore: 0 | 1 | 2 | 3;
  fitScore: number;
  passesHardFilters: boolean;
  reasons: string[];
  nextActions: string[];
};

export type DealPipelineReport = {
  evaluatedCount: number;
  passCount: number;
  topRanked: ListingScore[];
  rejected: ListingScore[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ENCUMBRANCE_SEVERITY: Record<EncumbranceTag, 0 | 1 | 2 | 3> = {
  CLEAN_TITLE: 0,
  EXISTING_LEASE: 1,
  SECOND_LIEN: 1,
  SMALL_CLAIMS: 1,
  CONSTRUCTION_INCOMPLETE: 2,
  TAX_LIEN: 2,
  ENVIRONMENTAL_FLAG: 2,
  TENANT_OPPOSABILITY: 3,
  LIEN_HOLDER_CLAIM: 3
};

export function encumbranceSeverity(tags: EncumbranceTag[]): 0 | 1 | 2 | 3 {
  if (tags.length === 0) return 0;
  return tags.reduce<0 | 1 | 2 | 3>(
    (worst, tag) => (ENCUMBRANCE_SEVERITY[tag] > worst ? ENCUMBRANCE_SEVERITY[tag] : worst),
    0
  );
}

export function impliedDiscountPct(listing: RawListing): number {
  if (listing.appraisalValueKrw <= 0) return 0;
  return ((listing.appraisalValueKrw - listing.minimumBidKrw) / listing.appraisalValueKrw) * 100;
}

export function impliedEntryCapRatePct(listing: RawListing): number | null {
  if (
    listing.estimatedStabilizedNoiKrw === null ||
    listing.estimatedStabilizedNoiKrw <= 0 ||
    listing.minimumBidKrw <= 0
  ) {
    return null;
  }
  return (listing.estimatedStabilizedNoiKrw / listing.minimumBidKrw) * 100;
}

export function impliedLtvVsSeniorPct(listing: RawListing): number | null {
  if (
    listing.seniorDebtKrw === null ||
    listing.seniorDebtKrw <= 0 ||
    listing.appraisalValueKrw <= 0
  ) {
    return null;
  }
  return (listing.seniorDebtKrw / listing.appraisalValueKrw) * 100;
}

function weeksUntil(date: Date | null, now: Date): number | null {
  if (!date) return null;
  const ms = date.getTime() - now.getTime();
  return ms / (1000 * 60 * 60 * 24 * 7);
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export function screenListing(
  listing: RawListing,
  criteria: SponsorCriteria,
  now: Date = new Date()
): ListingScore {
  const reasons: string[] = [];
  const nextActions: string[] = [];
  const discount = impliedDiscountPct(listing);
  const entryCap = impliedEntryCapRatePct(listing);
  const ltvSenior = impliedLtvVsSeniorPct(listing);
  const severity = encumbranceSeverity(listing.encumbrances);

  // Hard filters.
  let passes = true;

  if (!criteria.targetAssetClasses.includes(listing.assetClass)) {
    reasons.push(`Asset class ${listing.assetClass} not in sponsor mandate`);
    passes = false;
  }
  if (!criteria.allowedChannels.includes(listing.channel)) {
    reasons.push(`Channel ${listing.channel} not in mandate`);
    passes = false;
  }
  if (
    criteria.allowedProvinces.length > 0 &&
    !criteria.allowedProvinces.includes(listing.province)
  ) {
    reasons.push(`Province ${listing.province} outside allowed list`);
    passes = false;
  }
  if (
    listing.minimumBidKrw < criteria.minCheckSizeKrw ||
    listing.minimumBidKrw > criteria.maxCheckSizeKrw
  ) {
    reasons.push(
      `Check size ₩${(listing.minimumBidKrw / 1e9).toFixed(1)}bn outside [₩${(criteria.minCheckSizeKrw / 1e9).toFixed(1)}bn, ₩${(criteria.maxCheckSizeKrw / 1e9).toFixed(1)}bn]`
    );
    passes = false;
  }
  if (severity > criteria.maxEncumbranceSeverity) {
    reasons.push(
      `Encumbrance severity ${severity} exceeds sponsor tolerance ${criteria.maxEncumbranceSeverity}`
    );
    passes = false;
  }
  const weeksToEvent = weeksUntil(listing.eventDate, now);
  if (weeksToEvent !== null && weeksToEvent < 0) {
    reasons.push('Event date already passed');
    passes = false;
  } else if (weeksToEvent !== null && weeksToEvent > criteria.executionSpeedWeeks) {
    // Future events further than sponsor's window are OK — it's a non-blocker, just noted.
    nextActions.push(
      `Event ${weeksToEvent.toFixed(0)}w out — longer than sponsor's ${criteria.executionSpeedWeeks}w window, re-check closer to date`
    );
  }
  if (discount < criteria.minDiscountPct) {
    reasons.push(
      `Discount ${discount.toFixed(1)}% below sponsor minimum ${criteria.minDiscountPct}%`
    );
    passes = false;
  }
  if (entryCap !== null && entryCap < criteria.minEntryCapRatePct) {
    reasons.push(
      `Entry cap ${entryCap.toFixed(2)}% below sponsor minimum ${criteria.minEntryCapRatePct}%`
    );
    passes = false;
  }

  // Fit score (0..100).
  let score = 0;

  // Discount bucket (0..25 pts).
  if (discount >= 40) score += 25;
  else if (discount >= 30) score += 20;
  else if (discount >= 20) score += 13;
  else if (discount >= 10) score += 6;
  else if (discount >= 0) score += 2;

  // Entry cap premium over minimum (0..20 pts).
  if (entryCap !== null) {
    const premium = entryCap - criteria.minEntryCapRatePct;
    if (premium >= 2) score += 20;
    else if (premium >= 1) score += 14;
    else if (premium >= 0) score += 8;
    else score += 0;
  } else {
    score += 5; // NOI unknown — neutral
    nextActions.push('Stabilized NOI not available — commission short underwrite');
  }

  // Failed-rounds signal on court auction: 2+ failed rounds = stale/problematic.
  if (listing.channel === 'COURT_AUCTION') {
    if (listing.priorFailedRounds === 0) score += 5;
    else if (listing.priorFailedRounds === 1)
      score += 8; // sweet spot
    else if (listing.priorFailedRounds === 2) score += 3;
    else score -= 5; // 3+ failed rounds = something is wrong
    if (listing.priorFailedRounds >= 2) {
      nextActions.push('Two+ failed auction rounds — perform 권리분석 for hidden encumbrance');
    }
  } else {
    score += 5;
  }

  // Channel-specific adjustment.
  switch (listing.channel) {
    case 'OFF_MARKET':
      score += 8; // proprietary deal flow, negotiation room
      break;
    case 'NPL_PORTFOLIO':
      score += 4; // discount via distressed seller, but complex
      nextActions.push('NPL — confirm 담보권 실행 단계 and 선순위 채권 잔액');
      break;
    case 'COURT_AUCTION':
      score += 3;
      break;
    case 'PUBLIC_DISPOSAL':
      score += 2; // clean title bonus
      break;
    case 'BROKER_LISTING':
      score += 0; // crowded
      break;
  }

  // Encumbrance penalty (beyond hard filter).
  score -= severity * 4;

  // Senior debt overhang risk.
  if (ltvSenior !== null && ltvSenior >= 90) {
    score -= 8;
    reasons.push(`Senior debt ${ltvSenior.toFixed(0)}% of appraisal — thin equity cushion`);
  } else if (ltvSenior !== null && ltvSenior >= 70) {
    score -= 3;
  }

  score = Math.max(0, Math.min(100, score));

  if (passes && nextActions.length === 0) {
    nextActions.push('Pass to underwriting — run full-report with minimum-bid assumption');
  }

  return {
    listing,
    impliedDiscountPct: discount,
    impliedEntryCapRatePct: entryCap,
    impliedLtvVsSeniorPct: ltvSenior,
    encumbranceSeverityScore: severity,
    fitScore: score,
    passesHardFilters: passes,
    reasons,
    nextActions
  };
}

export function screenPipeline(
  listings: RawListing[],
  criteria: SponsorCriteria,
  now: Date = new Date()
): DealPipelineReport {
  const scored = listings.map((l) => screenListing(l, criteria, now));
  const passing = scored.filter((s) => s.passesHardFilters);
  const rejected = scored.filter((s) => !s.passesHardFilters);
  const sorted = [...passing].sort((a, b) => b.fitScore - a.fitScore);
  return {
    evaluatedCount: scored.length,
    passCount: passing.length,
    topRanked: sorted,
    rejected
  };
}

export { ENCUMBRANCE_SEVERITY };
