import type { MacroSeries } from '@prisma/client';
import type { DealMacroExposureDimension } from '@/lib/services/macro/deal-risk';
import type { MacroFactorDirection } from '@/lib/services/macro/factors';
import { estimateFactorCovariance } from '@/lib/services/macro/covariance';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CorrelationPenalty = {
  appliedPenaltyPct: number;
  headwindCount: number;
  activePairs: string[];
  commentary: string;
};

// ---------------------------------------------------------------------------
// Factor co-stress heuristic — named pairs with expert-set amplifiers
// ---------------------------------------------------------------------------
// METHODOLOGY: This is a heuristic stress amplifier, NOT a statistical
// correlation/covariance estimate. When a named factor pair is both NEGATIVE
// simultaneously, we add a hand-tuned amplification percentage on the premise
// that combined headwinds hurt more than the sum of individual scores. The
// `amplificationPct` values below are expert-set constants, not correlation
// coefficients estimated from data.

type StressPair = {
  factorA: string;
  factorB: string;
  label: string;
  // Expert-set amplification constant (percentage points), not an estimated
  // correlation coefficient.
  amplificationPct: number;
};

const CO_STRESS_PAIRS: StressPair[] = [
  {
    factorA: 'rate',
    factorB: 'credit',
    label: 'Rate-Credit Squeeze',
    amplificationPct: 12
  },
  {
    factorA: 'rate',
    factorB: 'liquidity',
    label: 'Rate-Liquidity Freeze',
    amplificationPct: 10
  },
  {
    factorA: 'credit',
    factorB: 'liquidity',
    label: 'Credit-Liquidity Crunch',
    amplificationPct: 15
  },
  {
    factorA: 'demand',
    factorB: 'construction',
    label: 'Demand-Construction Mismatch',
    amplificationPct: 8
  },
  {
    factorA: 'rate',
    factorB: 'leverage',
    label: 'Rate-Leverage Amplification',
    amplificationPct: 14
  },
  {
    factorA: 'credit',
    factorB: 'leverage',
    label: 'Credit-Leverage Spiral',
    amplificationPct: 16
  }
];

// ---------------------------------------------------------------------------
// Factor → representative MacroSeries key.
// Each co-stress factor is proxied by one observable MacroSeries so the
// estimated correlation between two series stands in for the correlation
// between the two factors. `leverage` has no direct macro series, so pairs
// involving it always use the expert constant.
// ---------------------------------------------------------------------------
const FACTOR_SERIES_KEY: Record<string, string | null> = {
  rate: 'policy_rate_pct',
  credit: 'credit_spread_bps',
  liquidity: 'transaction_volume_index',
  demand: 'vacancy_pct',
  construction: 'construction_cost_index',
  leverage: null
};

// ---------------------------------------------------------------------------
// Data-driven amplification mapping.
//
// Given the ESTIMATED correlation ρ between a factor pair's representative
// series, amplification scales with |ρ|: two factors that genuinely co-move
// (high |ρ|) deserve a larger co-stress amplifier than two that are nearly
// independent. We anchor the scale to the expert constants: a "fully
// correlated" pair (|ρ| = 1) earns the pair's legacy expert amplifier, and a
// pair near |ρ| = REF_CORRELATION earns roughly that same value, so the
// data-driven path is calibrated to — not divergent from — prior judgement.
//
//   amplificationPct = expertPct · clamp(|ρ| / REF_CORRELATION, 0, 1)
//
// Liquidity/credit/rate pairs are expected to co-move strongly; REF anchors
// the expert value to a realistic-but-not-perfect correlation.
// ---------------------------------------------------------------------------
const REF_CORRELATION = 0.6;

function deriveAmplificationPct(expertPct: number, estimatedCorrelation: number): number {
  const scale = Math.min(1, Math.abs(estimatedCorrelation) / REF_CORRELATION);
  return Number((expertPct * scale).toFixed(2));
}

// ---------------------------------------------------------------------------
// Triple-headwind cascade
// ---------------------------------------------------------------------------

const TRIPLE_HEADWIND_THRESHOLD = 3;
const TRIPLE_HEADWIND_EXTRA_PCT = 8;

// ---------------------------------------------------------------------------
// Optional history input for the data-driven path.
// ---------------------------------------------------------------------------
export type CorrelationStressOptions = {
  /** MacroSeries history used to estimate pairwise correlations. */
  series?: MacroSeries[];
  /** Optional market filter applied to the history. */
  market?: string;
};

type PairAmplifier = {
  amplificationPct: number;
  /** true when derived from estimated correlation, false when expert fallback */
  dataDriven: boolean;
};

/**
 * Resolve per-pair amplifiers. When sufficient aligned history exists for a
 * pair's two representative series (>= MIN_CHANGE_OBSERVATIONS change
 * observations), amplification is derived from the estimated correlation;
 * otherwise the legacy expert constant is used unchanged. With NO history this
 * is a no-op and every pair keeps its expert constant — identical to the
 * legacy heuristic.
 */
function resolvePairAmplifiers(options?: CorrelationStressOptions): Map<string, PairAmplifier> {
  const result = new Map<string, PairAmplifier>();
  for (const pair of CO_STRESS_PAIRS) {
    result.set(pair.label, { amplificationPct: pair.amplificationPct, dataDriven: false });
  }

  const series = options?.series;
  if (!series || series.length === 0) return result;

  for (const pair of CO_STRESS_PAIRS) {
    const keyA = FACTOR_SERIES_KEY[pair.factorA];
    const keyB = FACTOR_SERIES_KEY[pair.factorB];
    if (!keyA || !keyB) continue; // e.g. leverage has no series → keep expert

    const estimate = estimateFactorCovariance(series, [keyA, keyB], options?.market);
    if (!estimate.sufficient) continue; // insufficient history → keep expert

    const rho = estimate.correlation[0]?.[1] ?? 0;
    result.set(pair.label, {
      amplificationPct: deriveAmplificationPct(pair.amplificationPct, rho),
      dataDriven: true
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Core: compute co-stress amplification.
// ---------------------------------------------------------------------------
// For every co-stressed pair, adds an amplifier that is data-driven (scaled by
// the estimated correlation between the pair's representative series) when
// sufficient history is supplied, and falls back to the expert constant
// otherwise. With no history this reproduces the legacy heuristic exactly.

export function computeCorrelationPenalty(
  dimensions: DealMacroExposureDimension[],
  factorDirections: Record<string, MacroFactorDirection>,
  options?: CorrelationStressOptions
): CorrelationPenalty {
  const pairAmplifiers = resolvePairAmplifiers(options);
  const usedDataDriven = [...pairAmplifiers.values()].some((p) => p.dataDriven);
  const headwindKeys = new Set<string>();

  // A dimension is in "headwind" if its score >= 50
  for (const dim of dimensions) {
    if (dim.score >= 50) {
      headwindKeys.add(dim.key);
    }
  }

  // Also check factor-level directions for correlated factors
  const factorToHeadwind: Record<string, boolean> = {
    rate:
      headwindKeys.has('rate') ||
      factorDirections['rate_level'] === 'NEGATIVE' ||
      factorDirections['rate_momentum_bps'] === 'NEGATIVE',
    credit: headwindKeys.has('credit') || factorDirections['credit_stress'] === 'NEGATIVE',
    demand: headwindKeys.has('demand') || factorDirections['property_demand'] === 'NEGATIVE',
    construction:
      headwindKeys.has('construction') || factorDirections['construction_pressure'] === 'NEGATIVE',
    leverage: headwindKeys.has('leverage'),
    liquidity: headwindKeys.has('liquidity') || factorDirections['liquidity'] === 'NEGATIVE'
  };

  const headwindCount = Object.values(factorToHeadwind).filter(Boolean).length;
  let totalPenalty = 0;
  const activePairs: string[] = [];

  // Check co-stressed pairs
  for (const pair of CO_STRESS_PAIRS) {
    if (factorToHeadwind[pair.factorA] && factorToHeadwind[pair.factorB]) {
      totalPenalty += pairAmplifiers.get(pair.label)!.amplificationPct;
      activePairs.push(pair.label);
    }
  }

  // Triple-headwind cascade bonus
  if (headwindCount >= TRIPLE_HEADWIND_THRESHOLD) {
    totalPenalty += TRIPLE_HEADWIND_EXTRA_PCT * (headwindCount - TRIPLE_HEADWIND_THRESHOLD + 1);
    activePairs.push(`${headwindCount}-factor cascade`);
  }

  // Cap total penalty at 40% to avoid extreme distortion. Round to 1 decimal:
  // legacy expert constants are integers (so this is a no-op for the fallback
  // path) while data-driven values keep a single fractional digit.
  totalPenalty = Number(Math.min(totalPenalty, 40).toFixed(1));

  const method = usedDataDriven
    ? 'Amplifiers data-driven from estimated factor-change correlations.'
    : 'Amplifiers from expert constants (insufficient history).';

  let commentary: string;
  if (totalPenalty === 0) {
    commentary =
      activePairs.length > 0
        ? `No material co-stress amplification: co-stressed pairs (${activePairs.join(', ')}) show negligible estimated correlation. ${method}`
        : 'No co-stress amplification. Headwinds are isolated.';
  } else if (totalPenalty <= 15) {
    commentary = `Mild co-stress amplifier (+${totalPenalty}% penalty). ${activePairs.join(', ')} detected. ${method}`;
  } else if (totalPenalty <= 30) {
    commentary = `Significant co-stress amplifier (+${totalPenalty}% penalty). Multiple simultaneous headwinds: ${activePairs.join(', ')}. ${method}`;
  } else {
    commentary = `Severe co-stress amplifier (+${totalPenalty}% penalty). Systemic risk conditions: ${activePairs.join(', ')}. Consider defensive positioning. ${method}`;
  }

  return {
    appliedPenaltyPct: totalPenalty,
    headwindCount,
    activePairs,
    commentary
  };
}

// ---------------------------------------------------------------------------
// Apply penalty to overall score
// ---------------------------------------------------------------------------

export function applyCorrelationPenalty(baseScore: number, penalty: CorrelationPenalty): number {
  if (penalty.appliedPenaltyPct === 0) return baseScore;
  // The heuristic amplifier shifts the score toward 100, proportional to
  // remaining headroom.
  const headroom = 100 - baseScore;
  const boost = headroom * (penalty.appliedPenaltyPct / 100);
  return Math.min(100, Math.round(baseScore + boost));
}
