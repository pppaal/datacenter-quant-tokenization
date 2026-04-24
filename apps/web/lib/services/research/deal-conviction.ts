/**
 * Deal-conviction engine — the research-layer counterpart to the valuation
 * engines. Takes the universe of candidate deals in a submarket (or portfolio)
 * plus the sponsor's criteria, and produces a single "conviction score" per
 * submarket that answers: *is this area actively deployable capital right
 * now?*
 *
 * Why this exists:
 *   The valuation stack answers "what's this specific asset worth?" The
 *   research workspace answers "what's happening in the market?" Neither
 *   answers the originator's real question: "given everything I know, should
 *   my team be spending hours in Seocho-gu next week?"
 *
 *   This engine fuses three quantitative signals:
 *     1. Debt financeability (from debt-sourcing engine) — if senior debt
 *        won't look at Seocho assets at 60% LTV, conviction drops.
 *     2. Tenant credit quality (from tenant-credit engine) — weighted
 *        rent-weighted PD for the submarket's dominant tenant mix.
 *     3. Deal-pipeline fit (from deal-screener) — what share of currently
 *        listed opportunities pass the sponsor's hard filters.
 *
 *   It combines them into a 0–100 conviction score with "why" attribution
 *   and actionable next steps. The output feeds the research workspace so
 *   analysts see which submarkets to prioritize.
 */

import {
  sourceDebt,
  type DebtDealProfile,
  type DebtSourcingResult
} from '@/lib/services/valuation/debt-sourcing';
import {
  projectRentDefault,
  type RentDefaultProjection,
  type TenantExposure
} from '@/lib/services/valuation/tenant-credit';
import {
  screenPipeline,
  type DealPipelineReport,
  type RawListing,
  type SponsorCriteria
} from '@/lib/services/valuation/deal-screener';

export type ConvictionBand = 'HIGH' | 'MODERATE' | 'LOW' | 'AVOID';

export type SubmarketConvictionInput = {
  submarketId: string;
  submarketLabel: string;
  province: string;
  district: string;
  archetypeDealProfile: DebtDealProfile;
  tenantExposures: TenantExposure[];
  listings: RawListing[];
  sponsorCriteria: SponsorCriteria;
};

export type ConvictionComponent = {
  name: 'Debt financeability' | 'Tenant credit quality' | 'Deal pipeline fit';
  score: number;
  weight: number;
  contribution: number;
  rationale: string;
};

export type SubmarketConvictionScore = {
  submarketId: string;
  submarketLabel: string;
  overall: number;
  band: ConvictionBand;
  components: ConvictionComponent[];
  debtSourcing: DebtSourcingResult;
  tenantCredit: RentDefaultProjection | null;
  pipeline: DealPipelineReport;
  topActions: string[];
  headline: string;
};

export type PortfolioConvictionReport = {
  submarkets: SubmarketConvictionScore[];
  portfolioMedianScore: number;
  topRanked: SubmarketConvictionScore[];
  avoidList: SubmarketConvictionScore[];
};

// ---------------------------------------------------------------------------
// Scoring weights — tuned so that each axis materially matters.
// ---------------------------------------------------------------------------

const WEIGHT_DEBT = 0.4;
const WEIGHT_TENANT = 0.25;
const WEIGHT_PIPELINE = 0.35;

const BAND_THRESHOLDS: { band: ConvictionBand; min: number }[] = [
  { band: 'HIGH', min: 70 },
  { band: 'MODERATE', min: 50 },
  { band: 'LOW', min: 30 },
  { band: 'AVOID', min: 0 }
];

function bandFromScore(score: number): ConvictionBand {
  for (const { band, min } of BAND_THRESHOLDS) {
    if (score >= min) return band;
  }
  return 'AVOID';
}

// ---------------------------------------------------------------------------
// Component scorers
// ---------------------------------------------------------------------------

function scoreDebtFinanceability(result: DebtSourcingResult): {
  score: number;
  rationale: string;
} {
  const eligible = result.eligibleCount;
  const topSpread = result.recommendedTopN[0]?.indicativeSpreadBps ?? null;

  let score = 0;
  if (eligible >= 5) score += 55;
  else if (eligible >= 3) score += 42;
  else if (eligible >= 1) score += 22;
  else score += 0;

  if (topSpread !== null) {
    if (topSpread <= 180) score += 30;
    else if (topSpread <= 240) score += 22;
    else if (topSpread <= 320) score += 12;
    else score += 4;
  } else {
    score += 5;
  }

  if (result.recommendedTopN.some((m) => m.lender.category === 'INSURANCE' || m.lender.category === 'PENSION')) {
    score += 15;
  } else if (result.recommendedTopN.some((m) => m.lender.category === 'COMMERCIAL_BANK')) {
    score += 8;
  }

  score = Math.max(0, Math.min(100, score));

  const rationale = result.recommendedTopN.length > 0
    ? `${eligible} eligible lenders; top indicative spread ${topSpread ?? '—'}bps (${result.recommendedTopN[0]!.lender.displayName})`
    : result.fallbackRationale ?? 'No lenders matched — restructure deal or shift asset class';

  return { score, rationale };
}

function scoreTenantCredit(projection: RentDefaultProjection | null): {
  score: number;
  rationale: string;
} {
  if (!projection || projection.totalAnnualRentKrw === 0) {
    return {
      score: 50,
      rationale: 'Tenant roster not yet evaluated — neutral baseline'
    };
  }
  const pd = projection.weightedPd1yrPct;
  let score: number;
  if (pd <= 0.3) score = 95;
  else if (pd <= 0.8) score = 82;
  else if (pd <= 2) score = 65;
  else if (pd <= 5) score = 45;
  else if (pd <= 10) score = 25;
  else score = 8;

  const reservePct = projection.effectiveCreditReservePct;
  const rationale = `Weighted 1yr PD ${pd.toFixed(2)}% → effective credit reserve ${reservePct.toFixed(2)}% of rent (${projection.weightedGrade})`;
  return { score, rationale };
}

function scoreDealPipelineFit(pipeline: DealPipelineReport): {
  score: number;
  rationale: string;
} {
  if (pipeline.evaluatedCount === 0) {
    return {
      score: 30,
      rationale: 'No live listings in submarket — pipeline dry'
    };
  }
  const passRate = pipeline.passCount / pipeline.evaluatedCount;
  const topFit = pipeline.topRanked[0]?.fitScore ?? 0;

  let score = 0;
  if (passRate >= 0.4) score += 45;
  else if (passRate >= 0.25) score += 32;
  else if (passRate >= 0.1) score += 18;
  else score += 4;

  score += Math.min(40, topFit * 0.5);

  if (pipeline.passCount >= 3) score += 15;

  score = Math.max(0, Math.min(100, score));

  const rationale = `${pipeline.passCount}/${pipeline.evaluatedCount} listings pass hard filters; top fit ${topFit.toFixed(0)}/100`;
  return { score, rationale };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function scoreSubmarketConviction(
  input: SubmarketConvictionInput,
  now: Date = new Date()
): SubmarketConvictionScore {
  const debtSourcing = sourceDebt(input.archetypeDealProfile);
  const tenantCredit = input.tenantExposures.length > 0
    ? projectRentDefault(input.tenantExposures)
    : null;
  const pipeline = screenPipeline(input.listings, input.sponsorCriteria, now);

  const debt = scoreDebtFinanceability(debtSourcing);
  const tenant = scoreTenantCredit(tenantCredit);
  const pipelineScore = scoreDealPipelineFit(pipeline);

  const components: ConvictionComponent[] = [
    {
      name: 'Debt financeability',
      score: debt.score,
      weight: WEIGHT_DEBT,
      contribution: debt.score * WEIGHT_DEBT,
      rationale: debt.rationale
    },
    {
      name: 'Tenant credit quality',
      score: tenant.score,
      weight: WEIGHT_TENANT,
      contribution: tenant.score * WEIGHT_TENANT,
      rationale: tenant.rationale
    },
    {
      name: 'Deal pipeline fit',
      score: pipelineScore.score,
      weight: WEIGHT_PIPELINE,
      contribution: pipelineScore.score * WEIGHT_PIPELINE,
      rationale: pipelineScore.rationale
    }
  ];

  const overall = Math.round(components.reduce((sum, c) => sum + c.contribution, 0));
  const band = bandFromScore(overall);

  const topActions = buildActionList(band, components, pipeline);
  const headline = buildHeadline(input.submarketLabel, band, overall, components);

  return {
    submarketId: input.submarketId,
    submarketLabel: input.submarketLabel,
    overall,
    band,
    components,
    debtSourcing,
    tenantCredit,
    pipeline,
    topActions,
    headline
  };
}

function buildActionList(
  band: ConvictionBand,
  components: ConvictionComponent[],
  pipeline: DealPipelineReport
): string[] {
  const actions: string[] = [];
  if (band === 'HIGH' || band === 'MODERATE') {
    const topListing = pipeline.topRanked[0];
    if (topListing) {
      actions.push(
        `Underwrite top pipeline listing ${topListing.listing.listingId} (fit ${topListing.fitScore.toFixed(0)}/100)`
      );
    }
  }
  const weakest = [...components].sort((a, b) => a.score - b.score)[0]!;
  if (weakest.score < 50) {
    actions.push(`Shore up ${weakest.name}: ${weakest.rationale}`);
  }
  if (band === 'AVOID') {
    actions.push('Pause origination in this submarket — revisit after macro regime change');
  }
  if (actions.length === 0) {
    actions.push('Continue monitoring — no single axis is blocking');
  }
  return actions;
}

function buildHeadline(
  label: string,
  band: ConvictionBand,
  overall: number,
  components: ConvictionComponent[]
): string {
  const top = [...components].sort((a, b) => b.score - a.score)[0]!;
  const bottom = [...components].sort((a, b) => a.score - b.score)[0]!;
  const verb =
    band === 'HIGH' ? 'Deploy capital' :
    band === 'MODERATE' ? 'Selectively engage' :
    band === 'LOW' ? 'Require exceptional deal' :
    'Avoid';
  return `${label}: ${verb} (conviction ${overall}/100). Best axis: ${top.name.toLowerCase()} (${top.score}); weakest: ${bottom.name.toLowerCase()} (${bottom.score}).`;
}

export function scorePortfolioConviction(
  submarkets: SubmarketConvictionInput[],
  now: Date = new Date()
): PortfolioConvictionReport {
  const scores = submarkets.map((s) => scoreSubmarketConviction(s, now));
  const sorted = [...scores].sort((a, b) => b.overall - a.overall);
  const portfolioMedianScore = computeMedian(scores.map((s) => s.overall));
  return {
    submarkets: scores,
    portfolioMedianScore,
    topRanked: sorted.filter((s) => s.band === 'HIGH' || s.band === 'MODERATE'),
    avoidList: sorted.filter((s) => s.band === 'AVOID')
  };
}

function computeMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

export { WEIGHT_DEBT, WEIGHT_TENANT, WEIGHT_PIPELINE, bandFromScore };
