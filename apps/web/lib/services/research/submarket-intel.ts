/**
 * Submarket intel aggregator — one call that produces the full research
 * view for a single submarket: conviction score, competitive positioning,
 * and a unified "playbook" of what the origination team should do next.
 *
 * Why this exists:
 *   The research workspace wants to display a submarket card that
 *   answers three questions in one glance:
 *     1. How good is this submarket RIGHT NOW? (conviction)
 *     2. How is the subject asset positioned vs peers? (competitive)
 *     3. What should the team do this week? (playbook)
 *
 *   Rather than forcing the UI to call three engines and stitch the
 *   result, this module does the stitching and returns a single typed
 *   shape. It stays a pure function so it's cheap to test and swap.
 */

import {
  scoreSubmarketConviction,
  type SubmarketConvictionInput,
  type SubmarketConvictionScore
} from '@/lib/services/research/deal-conviction';
import {
  buildCompetitiveIntelligence,
  type CompetitiveIntelInput,
  type CompetitiveIntelReport
} from '@/lib/services/research/competitive-intelligence';

export type SubmarketPlaybookAction = {
  priority: 'IMMEDIATE' | 'THIS_WEEK' | 'MONITOR';
  category: 'ORIGINATION' | 'DILIGENCE' | 'MARKET_INTEL' | 'CAPITAL_MARKETS';
  label: string;
  reason: string;
};

export type SubmarketIntelInput = {
  conviction: SubmarketConvictionInput;
  competitive: CompetitiveIntelInput;
};

export type SubmarketIntel = {
  submarketId: string;
  submarketLabel: string;
  asOf: Date;
  conviction: SubmarketConvictionScore;
  competitive: CompetitiveIntelReport;
  playbook: SubmarketPlaybookAction[];
  executiveSummary: string[];
};

// ---------------------------------------------------------------------------
// Playbook generation — reads signals from both engines and emits ranked
// actions.
// ---------------------------------------------------------------------------

function buildPlaybook(
  conviction: SubmarketConvictionScore,
  competitive: CompetitiveIntelReport
): SubmarketPlaybookAction[] {
  const actions: SubmarketPlaybookAction[] = [];

  if (conviction.band === 'HIGH') {
    const topListing = conviction.pipeline.topRanked[0];
    if (topListing) {
      actions.push({
        priority: 'IMMEDIATE',
        category: 'ORIGINATION',
        label: `Bid prep on ${topListing.listing.listingId}`,
        reason: `Conviction HIGH (${conviction.overall}/100) and top listing fit ${topListing.fitScore.toFixed(0)}/100`
      });
    }
  }

  if (conviction.band === 'MODERATE') {
    actions.push({
      priority: 'THIS_WEEK',
      category: 'ORIGINATION',
      label: 'Selective sourcing push',
      reason: `Conviction MODERATE (${conviction.overall}/100); require best-in-class risk-adjusted deal`
    });
  }

  if (conviction.band === 'AVOID') {
    actions.push({
      priority: 'IMMEDIATE',
      category: 'ORIGINATION',
      label: 'Pause outbound sourcing',
      reason: `Conviction AVOID (${conviction.overall}/100) — redirect originator bandwidth`
    });
  }

  if (competitive.supplyOutlook.supplyShockRisk === 'HIGH' || competitive.supplyOutlook.supplyShockRisk === 'EXTREME') {
    actions.push({
      priority: 'THIS_WEEK',
      category: 'MARKET_INTEL',
      label: `Re-model vacancy under +${(competitive.supplyOutlook.next24mDeliverySqm / 1000).toFixed(0)}k sqm new supply`,
      reason: `${competitive.supplyOutlook.supplyShockRisk} supply shock in next 24mo`
    });
  }

  if (competitive.transactionVelocity.momentum === 'FROZEN') {
    actions.push({
      priority: 'THIS_WEEK',
      category: 'CAPITAL_MARKETS',
      label: 'Stress-test 18mo exit liquidity',
      reason: 'Transaction market frozen — price in wider exit cap and extended marketing timeline'
    });
  }

  if (competitive.tenantSignals.signal === 'OUTFLOW') {
    actions.push({
      priority: 'THIS_WEEK',
      category: 'DILIGENCE',
      label: 'Reprice vacancy reserve upward',
      reason: `Net tenant outflow of ${Math.abs(competitive.tenantSignals.last180dNetAbsorptionSqm).toLocaleString()} sqm last 180 days`
    });
  }

  if (competitive.subjectPositioning.positioningVerdict === 'DISTRESSED') {
    actions.push({
      priority: 'IMMEDIATE',
      category: 'DILIGENCE',
      label: 'Investigate cap-rate dislocation',
      reason: competitive.subjectPositioning.rationale
    });
  }

  if (competitive.subjectPositioning.positioningVerdict === 'PREMIUM') {
    actions.push({
      priority: 'THIS_WEEK',
      category: 'DILIGENCE',
      label: 'Defend premium pricing with quality attribution',
      reason: competitive.subjectPositioning.rationale
    });
  }

  const debtComp = conviction.components.find((c) => c.name === 'Debt financeability')!;
  if (debtComp.score < 40) {
    actions.push({
      priority: 'THIS_WEEK',
      category: 'CAPITAL_MARKETS',
      label: 'Pre-sound alternative lender pool',
      reason: debtComp.rationale
    });
  }

  const tenantComp = conviction.components.find((c) => c.name === 'Tenant credit quality')!;
  if (tenantComp.score < 40) {
    actions.push({
      priority: 'THIS_WEEK',
      category: 'DILIGENCE',
      label: 'Tighten rent reserve and guaranty structure',
      reason: tenantComp.rationale
    });
  }

  if (actions.length === 0) {
    actions.push({
      priority: 'MONITOR',
      category: 'MARKET_INTEL',
      label: 'No active flags',
      reason: 'Submarket stable across conviction and competitive axes; continue weekly monitoring'
    });
  }

  return actions;
}

function buildExecutiveSummary(
  conviction: SubmarketConvictionScore,
  competitive: CompetitiveIntelReport
): string[] {
  return [
    conviction.headline,
    competitive.headline,
    `Playbook priority: ${conviction.band === 'HIGH' ? 'deploy' : conviction.band === 'AVOID' ? 'pause' : 'selective'}.`
  ];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function buildSubmarketIntel(
  input: SubmarketIntelInput,
  now: Date = new Date()
): SubmarketIntel {
  const conviction = scoreSubmarketConviction(input.conviction, now);
  const competitive = buildCompetitiveIntelligence(input.competitive);
  const playbook = buildPlaybook(conviction, competitive);
  const executiveSummary = buildExecutiveSummary(conviction, competitive);
  return {
    submarketId: input.conviction.submarketId,
    submarketLabel: input.conviction.submarketLabel,
    asOf: input.competitive.asOf,
    conviction,
    competitive,
    playbook,
    executiveSummary
  };
}

export function buildPortfolioIntel(
  inputs: SubmarketIntelInput[],
  now: Date = new Date()
): SubmarketIntel[] {
  return inputs
    .map((i) => buildSubmarketIntel(i, now))
    .sort((a, b) => b.conviction.overall - a.conviction.overall);
}
