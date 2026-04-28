/**
 * Deterministic investment verdict engine.
 *
 * Scores a deal on 7 dimensions, maps the total to a 5-tier recommendation,
 * and produces human-readable reasons, red flags, and conditions. No LLM —
 * every number traces back to the MC distribution, base pro-forma, and
 * covenant check.
 *
 * Default hurdles (all overridable):
 *   target levered IRR = 12%     floor P10 IRR = 6%
 *   max Prob(IRR<8%) = 25%       max macro risk score = 70 (0-100 scale)
 *   min MOIC P50 = 1.5x          DSCR covenant = 1.15 (from caller)
 */
import type { ReturnMetrics } from '@/lib/services/valuation/return-metrics';
import type { MonteCarloResult } from '@/lib/services/valuation/monte-carlo';
import type { RefinanceAnalysis } from '@/lib/services/valuation/refinancing';

export type VerdictTier = 'STRONG_BUY' | 'BUY' | 'CONDITIONAL' | 'PASS' | 'AVOID';

export type ScoredDimension = {
  dimension: string;
  observed: string;
  threshold: string;
  score: number; // signed: dim-specific range (e.g. MOIC caps at +2, DSCR caps at +1)
  weight: number;
  contribution: number;
  maxScore: number; // max achievable raw score for this dim (used for normalization)
  minScore: number; // min achievable raw score for this dim
};

export type InvestmentVerdict = {
  tier: VerdictTier;
  headline: string;
  totalScore: number;
  maxPossibleScore: number;
  normalizedScore: number; // -1..+1
  dimensions: ScoredDimension[];
  positives: string[];
  negatives: string[];
  redFlags: string[];
  conditions: string[];
  hurdlesUsed: VerdictHurdles;
};

export type VerdictHurdles = {
  targetLeveredIrrPct: number;
  floorP10IrrPct: number;
  maxProbBelow8Pct: number;
  minMoicP50: number;
  maxMacroScore: number;
  dscrCovenant: number;
};

export const DEFAULT_HURDLES: VerdictHurdles = {
  targetLeveredIrrPct: 12,
  floorP10IrrPct: 6,
  maxProbBelow8Pct: 0.25,
  minMoicP50: 1.5,
  maxMacroScore: 70,
  dscrCovenant: 1.15
};

export type VerdictInputs = {
  returnMetrics: ReturnMetrics;
  monteCarlo: MonteCarloResult;
  macroOverallScore: number;
  debtCovenantBreaches: { yearsBelowOne: number[]; yearsBelowFloor: number[] };
  refinancing: RefinanceAnalysis;
  hurdles?: Partial<VerdictHurdles>;
};

// ---------------------------------------------------------------------------
// Scoring rubric — continuous linear interpolation over anchor points.
//
// Each scoreXxx function declares (value, score) anchors sorted by value
// ascending. interpolateScore() linearly interpolates between adjacent
// anchors and clamps at the first/last for out-of-range values. This gives
// fractional scores (e.g. -2.17 instead of always -3 below the target-4
// threshold), so two deals on the wrong side of a hurdle no longer collapse
// to the same bucket.
//
// Score precision: 0.01 (round at compute, display 2dp). Hard-fail trigger:
// score within 0.01 of the dim's minScore — effectively only at the bottom
// anchor, but with float-tolerance.
// ---------------------------------------------------------------------------

type Anchor = readonly [value: number, score: number];

function interpolateScore(value: number, anchors: readonly Anchor[]): number {
  if (anchors.length === 0) return 0;
  const first = anchors[0]!;
  const last = anchors[anchors.length - 1]!;
  if (value <= first[0]) return first[1];
  if (value >= last[0]) return last[1];
  for (let i = 1; i < anchors.length; i++) {
    const [x0, y0] = anchors[i - 1]!;
    const [x1, y1] = anchors[i]!;
    if (value <= x1) {
      const t = x1 === x0 ? 0 : (value - x0) / (x1 - x0);
      return y0 + t * (y1 - y0);
    }
  }
  return last[1];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function anchorRangeStr(anchors: readonly Anchor[], unit: string, ascending: boolean): string {
  // Show pivot points so the reader sees the full curve, not just one threshold.
  // ascending=true means higher value → higher score (e.g. IRR).
  // ascending=false means higher value → lower score (e.g. macro risk).
  const sorted = ascending ? anchors : [...anchors].reverse();
  return sorted.map(([v, s]) => `${v}${unit}→${s >= 0 ? '+' : ''}${s}`).join(' / ');
}

function scoreLeveredIrr(baseIrrPct: number | null, target: number): ScoredDimension {
  // Anchors centered on target. Above target+3 fully positive; bottom at target-8.
  const anchors: Anchor[] = [
    [target - 8, -3],
    [target - 4, -2],
    [target - 2, 0],
    [target, 2],
    [target + 3, 3]
  ];
  const score = baseIrrPct === null ? -2 : round2(interpolateScore(baseIrrPct, anchors));
  return {
    dimension: 'Base Levered IRR',
    observed: baseIrrPct === null ? 'N/A' : `${baseIrrPct.toFixed(2)}%`,
    threshold: anchorRangeStr(anchors, '%', true),
    score,
    weight: 3,
    contribution: round2(score * 3),
    maxScore: 3,
    minScore: -3
  };
}

function scoreP10Irr(p10Pct: number | null, floor: number): ScoredDimension {
  const anchors: Anchor[] = [
    [-3, -3],
    [0, -2],
    [floor - 2, -1],
    [floor, 1],
    [floor + 2, 2]
  ];
  const score = p10Pct === null ? -2 : round2(interpolateScore(p10Pct, anchors));
  return {
    dimension: 'P10 Downside IRR',
    observed: p10Pct === null ? 'N/A' : `${p10Pct.toFixed(2)}%`,
    threshold: anchorRangeStr(anchors, '%', true),
    score,
    weight: 3,
    contribution: round2(score * 3),
    maxScore: 2,
    minScore: -3
  };
}

function scoreProbBelow(prob: number, cap: number): ScoredDimension {
  // Lower prob = better. Anchors increase in x, decrease in y.
  const anchors: Anchor[] = [
    [Math.max(0, cap - 0.15), 2],
    [cap, 1],
    [cap + 0.15, -1],
    [cap + 0.3, -2],
    [cap + 0.45, -3]
  ];
  const score = round2(interpolateScore(prob, anchors));
  const anchorStr = anchors
    .map(([v, s]) => `${(v * 100).toFixed(0)}%→${s >= 0 ? '+' : ''}${s}`)
    .join(' / ');
  return {
    dimension: 'Prob(IRR < 8%)',
    observed: `${(prob * 100).toFixed(1)}%`,
    threshold: anchorStr,
    score,
    weight: 2,
    contribution: round2(score * 2),
    maxScore: 2,
    minScore: -3
  };
}

function scoreMoic(moicP50: number | null, minMoic: number): ScoredDimension {
  const v = moicP50 ?? 0;
  const anchors: Anchor[] = [
    [minMoic - 0.8, -2],
    [minMoic - 0.3, 0],
    [minMoic, 1],
    [minMoic + 0.5, 2]
  ];
  const score = round2(interpolateScore(v, anchors));
  const anchorStr = anchors
    .map(([val, s]) => `${val.toFixed(2)}x→${s >= 0 ? '+' : ''}${s}`)
    .join(' / ');
  return {
    dimension: 'P50 MOIC',
    observed: `${v.toFixed(2)}x`,
    threshold: anchorStr,
    score,
    weight: 1,
    contribution: round2(score * 1),
    maxScore: 2,
    minScore: -2
  };
}

function scoreMacro(overall: number, cap: number): ScoredDimension {
  // Lower macro score = better risk environment.
  const anchors: Anchor[] = [
    [Math.max(0, cap - 40), 2],
    [Math.max(0, cap - 20), 1],
    [cap, 0],
    [cap + 15, -2],
    [cap + 30, -3]
  ];
  const score = round2(interpolateScore(overall, anchors));
  const anchorStr = anchors.map(([v, s]) => `${v}→${s >= 0 ? '+' : ''}${s}`).join(' / ');
  return {
    dimension: 'Macro Risk',
    observed: `${overall}/100`,
    threshold: anchorStr,
    score,
    weight: 2,
    contribution: round2(score * 2),
    maxScore: 2,
    minScore: -3
  };
}

function scoreDscr(
  yearsBelowOne: number[],
  yearsBelowFloor: number[],
  covenant: number
): ScoredDimension {
  // DSCR keeps a hard-fail rule: any year < 1.00x = immediate -3 (debt
  // service shortfall). Below-floor years interpolate continuously by count
  // so 1y vs 4y of borderline breach are differentiated.
  let score: number;
  let observed: string;
  if (yearsBelowOne.length > 0) {
    score = -3;
    observed = `${yearsBelowOne.length}y < 1.00x (HARD)`;
  } else {
    // Continuous penalty by yearsBelowFloor count: 0→+1, 1→0, 2→-0.5, 3→-1, 5→-2, 7+→-2.5
    const breachAnchors: Anchor[] = [
      [0, 1],
      [1, 0],
      [2, -0.5],
      [3, -1],
      [5, -2],
      [7, -2.5]
    ];
    score = round2(interpolateScore(yearsBelowFloor.length, breachAnchors));
    observed =
      yearsBelowFloor.length === 0
        ? 'all years compliant'
        : `${yearsBelowFloor.length}y < ${covenant.toFixed(2)}x`;
  }
  return {
    dimension: 'DSCR Covenant',
    observed,
    threshold: `${covenant.toFixed(2)}x floor / 1.00x HARD; 0y→+1, 1y→0, 3y→-1, 5y→-2`,
    score,
    weight: 3,
    contribution: round2(score * 3),
    maxScore: 1,
    minScore: -3
  };
}

function scoreRefi(refi: RefinanceAnalysis): ScoredDimension {
  // Severity-weighted continuous penalty: each WARNING -0.5, each CRITICAL -1.5.
  // Floor at -2 unless 2+ CRITICAL (then -3 hard fail). No triggers = +1.
  const critical = refi.triggers.filter((t) => t.severity === 'CRITICAL').length;
  const warning = refi.triggers.filter((t) => t.severity === 'WARNING').length;

  let score: number;
  let observed: string;
  if (critical >= 2) {
    score = -3;
    observed = `${critical} CRITICAL triggers (HARD)`;
  } else {
    const raw = 1 - warning * 0.5 - critical * 1.5;
    score = round2(Math.max(-2, raw));
    if (critical > 0 && warning > 0) observed = `${critical} CRITICAL + ${warning} WARNING`;
    else if (critical > 0) observed = `${critical} CRITICAL trigger${critical > 1 ? 's' : ''}`;
    else if (warning > 0) observed = `${warning} WARNING trigger${warning > 1 ? 's' : ''}`;
    else observed = 'no triggers';
  }
  return {
    dimension: 'Refinance Pressure',
    observed,
    threshold: 'WARNING -0.5 each / CRITICAL -1.5 each / 2+ CRITICAL = HARD',
    score,
    weight: 1,
    contribution: round2(score * 1),
    maxScore: 1,
    minScore: -3
  };
}

// ---------------------------------------------------------------------------
// Tier mapping
// ---------------------------------------------------------------------------
function tierOf(normalized: number, hardFails: number): { tier: VerdictTier; headline: string } {
  if (hardFails > 0) {
    return {
      tier: 'AVOID',
      headline: `${hardFails} hard failure(s) — deal should not close as underwritten.`
    };
  }
  if (normalized >= 0.55) {
    return {
      tier: 'STRONG_BUY',
      headline: 'Strong risk-adjusted returns across the distribution.'
    };
  }
  if (normalized >= 0.25) {
    return { tier: 'BUY', headline: 'Attractive base case with manageable downside.' };
  }
  if (normalized >= 0) {
    return {
      tier: 'CONDITIONAL',
      headline: 'Marginal — proceed only after negotiating the conditions below.'
    };
  }
  if (normalized >= -0.3) {
    return { tier: 'PASS', headline: 'Return profile does not clear hurdles at this price.' };
  }
  return { tier: 'AVOID', headline: 'Materially below hurdles — walk unless thesis changes.' };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
export function evaluateInvestment(inputs: VerdictInputs): InvestmentVerdict {
  const hurdles: VerdictHurdles = { ...DEFAULT_HURDLES, ...(inputs.hurdles ?? {}) };
  const { returnMetrics, monteCarlo, macroOverallScore, debtCovenantBreaches, refinancing } =
    inputs;

  const p10 = monteCarlo.leveredIrr.p10;
  const p50 = monteCarlo.leveredIrr.p50;
  const probBelow8 =
    monteCarlo.probLeveredIrrBelow.find((p) => p.targetPct === 8)?.probability ?? 0;
  const moicP50 = monteCarlo.moic.p50;

  const dimensions: ScoredDimension[] = [
    scoreLeveredIrr(returnMetrics.equityIrr, hurdles.targetLeveredIrrPct),
    scoreP10Irr(p10, hurdles.floorP10IrrPct),
    scoreProbBelow(probBelow8, hurdles.maxProbBelow8Pct),
    scoreMoic(moicP50, hurdles.minMoicP50),
    scoreMacro(macroOverallScore, hurdles.maxMacroScore),
    scoreDscr(
      debtCovenantBreaches.yearsBelowOne,
      debtCovenantBreaches.yearsBelowFloor,
      hurdles.dscrCovenant
    ),
    scoreRefi(refinancing)
  ];

  // Normalize against the per-dim achievable range. The old denominator
  // (3 × weight for every dim) over-counted: MOIC caps at +2, DSCR/Refi at +1,
  // P10/Prob/Macro at +2 — so a perfect deal could only ever reach ~0.64
  // under the old scale, biasing every verdict downward.
  const totalScore = dimensions.reduce((s, d) => s + d.contribution, 0);
  const maxPossibleScore = dimensions.reduce((s, d) => s + d.maxScore * d.weight, 0);
  const minPossibleScore = dimensions.reduce((s, d) => s + d.minScore * d.weight, 0);
  const normalizedScore =
    totalScore >= 0
      ? maxPossibleScore > 0
        ? Number((totalScore / maxPossibleScore).toFixed(3))
        : 0
      : minPossibleScore < 0
        ? Number((totalScore / Math.abs(minPossibleScore)).toFixed(3))
        : 0;

  // Float-tolerant categorization. With continuous scores, |score| < 0.05 is
  // treated as neutral (not worth flagging either way). Hard fail = score
  // within rounding of -3.
  const hardFails = dimensions.filter((d) => d.score <= -2.99).length;
  const { tier, headline } = tierOf(normalizedScore, hardFails);

  const positives = dimensions
    .filter((d) => d.score >= 0.05)
    .map(
      (d) =>
        `${d.dimension}: ${d.observed} (score ${d.score >= 0 ? '+' : ''}${d.score.toFixed(2)}; ${d.threshold})`
    );
  const negatives = dimensions
    .filter((d) => d.score <= -0.05 && d.score > -2.99)
    .map((d) => `${d.dimension}: ${d.observed} (score ${d.score.toFixed(2)}; ${d.threshold})`);
  const redFlags = dimensions
    .filter((d) => d.score <= -2.99)
    .map((d) => `${d.dimension}: ${d.observed} — score ${d.score.toFixed(2)} (${d.threshold})`);

  // Conditions to unlock a CONDITIONAL verdict
  const conditions: string[] = [];
  if (
    debtCovenantBreaches.yearsBelowFloor.length > 0 &&
    debtCovenantBreaches.yearsBelowOne.length === 0
  ) {
    conditions.push(
      `Negotiate DSCR covenant step-down to ${hurdles.dscrCovenant.toFixed(2)}x or holiday for years ${debtCovenantBreaches.yearsBelowFloor.join(', ')}.`
    );
  }
  if (p10 !== null && p10 < hurdles.floorP10IrrPct) {
    conditions.push(
      `P10 IRR ${p10.toFixed(1)}% is below ${hurdles.floorP10IrrPct}% floor — push for lower purchase price or rate-lock to compress downside.`
    );
  }
  if (probBelow8 > hurdles.maxProbBelow8Pct) {
    conditions.push(
      `Prob(IRR<8%) at ${(probBelow8 * 100).toFixed(0)}% exceeds ${(hurdles.maxProbBelow8Pct * 100).toFixed(0)}% cap — structure a price adjustment or CapEx holdback.`
    );
  }
  if (refinancing.triggers.some((t) => t.severity === 'CRITICAL')) {
    conditions.push(
      'Critical refinance trigger present — pre-negotiate extension option or cash sweep mechanism.'
    );
  }
  if (macroOverallScore > hurdles.maxMacroScore) {
    conditions.push(
      `Macro exposure ${macroOverallScore}/100 above ${hurdles.maxMacroScore} — defer or add rate/FX hedges.`
    );
  }

  return {
    tier,
    headline,
    totalScore,
    maxPossibleScore,
    normalizedScore,
    dimensions,
    positives,
    negatives,
    redFlags,
    conditions,
    hurdlesUsed: hurdles
  };
}
