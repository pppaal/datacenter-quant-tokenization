import type { DealMacroExposureDimension } from '@/lib/services/macro/deal-risk';
import type { MacroFactorDirection } from '@/lib/services/macro/factors';

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
// Known correlated stress pairs
// ---------------------------------------------------------------------------
// When these factor pairs are both NEGATIVE simultaneously, the combined
// impact is worse than the sum of individual scores.

type StressPair = {
  factorA: string;
  factorB: string;
  label: string;
  amplificationPct: number;
};

const CORRELATED_STRESS_PAIRS: StressPair[] = [
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
// Triple-headwind cascade
// ---------------------------------------------------------------------------

const TRIPLE_HEADWIND_THRESHOLD = 3;
const TRIPLE_HEADWIND_EXTRA_PCT = 8;

// ---------------------------------------------------------------------------
// Core: compute correlation-based stress amplification
// ---------------------------------------------------------------------------

export function computeCorrelationPenalty(
  dimensions: DealMacroExposureDimension[],
  factorDirections: Record<string, MacroFactorDirection>
): CorrelationPenalty {
  const headwindKeys = new Set<string>();

  // A dimension is in "headwind" if its score >= 50
  for (const dim of dimensions) {
    if (dim.score >= 50) {
      headwindKeys.add(dim.key);
    }
  }

  // Also check factor-level directions for correlated factors
  const factorToHeadwind: Record<string, boolean> = {
    rate: headwindKeys.has('rate') || factorDirections['rate_level'] === 'NEGATIVE' || factorDirections['rate_momentum_bps'] === 'NEGATIVE',
    credit: headwindKeys.has('credit') || factorDirections['credit_stress'] === 'NEGATIVE',
    demand: headwindKeys.has('demand') || factorDirections['property_demand'] === 'NEGATIVE',
    construction: headwindKeys.has('construction') || factorDirections['construction_pressure'] === 'NEGATIVE',
    leverage: headwindKeys.has('leverage'),
    liquidity: headwindKeys.has('liquidity') || factorDirections['liquidity'] === 'NEGATIVE'
  };

  const headwindCount = Object.values(factorToHeadwind).filter(Boolean).length;
  let totalPenalty = 0;
  const activePairs: string[] = [];

  // Check correlated pairs
  for (const pair of CORRELATED_STRESS_PAIRS) {
    if (factorToHeadwind[pair.factorA] && factorToHeadwind[pair.factorB]) {
      totalPenalty += pair.amplificationPct;
      activePairs.push(pair.label);
    }
  }

  // Triple-headwind cascade bonus
  if (headwindCount >= TRIPLE_HEADWIND_THRESHOLD) {
    totalPenalty += TRIPLE_HEADWIND_EXTRA_PCT * (headwindCount - TRIPLE_HEADWIND_THRESHOLD + 1);
    activePairs.push(`${headwindCount}-factor cascade`);
  }

  // Cap total penalty at 40% to avoid extreme distortion
  totalPenalty = Math.min(totalPenalty, 40);

  let commentary: string;
  if (totalPenalty === 0) {
    commentary = 'No correlated stress amplification. Headwinds are isolated.';
  } else if (totalPenalty <= 15) {
    commentary = `Mild correlation stress (+${totalPenalty}% penalty). ${activePairs.join(', ')} detected.`;
  } else if (totalPenalty <= 30) {
    commentary = `Significant correlation stress (+${totalPenalty}% penalty). Multiple correlated headwinds: ${activePairs.join(', ')}.`;
  } else {
    commentary = `Severe correlation stress (+${totalPenalty}% penalty). Systemic risk conditions: ${activePairs.join(', ')}. Consider defensive positioning.`;
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
  // Penalty shifts the score toward 100, proportional to remaining headroom
  const headroom = 100 - baseScore;
  const boost = headroom * (penalty.appliedPenaltyPct / 100);
  return Math.min(100, Math.round(baseScore + boost));
}
