/**
 * Implied bid-price solvers.
 *
 * Given a target IRR (base, MC P50, or MC P10), bisects on purchase price
 * until the rebuilt pro-forma hits the target. Monotonicity: holding all
 * else constant, higher price → lower IRR, so bisection converges cleanly.
 *
 * Every other input (LTV, rate, cap, growth, σ, correlation) is held at the
 * caller's baseline — the output is "what would I pay to hit X%".
 */
import {
  buildSyntheticProForma,
  type ProFormaInputs
} from '@/lib/services/valuation/synthetic-pro-forma';
import { computeReturnMetricsFromProForma } from '@/lib/services/valuation/return-metrics';
import { runMonteCarlo } from '@/lib/services/valuation/monte-carlo';

export type BidTarget = 'base_irr' | 'mc_p50_irr' | 'mc_p10_irr' | 'break_even';

export type BidSolution = {
  target: BidTarget;
  targetIrrPct: number | null; // null for break_even
  bidPriceKrw: number;
  basePriceKrw: number;
  discountPct: number; // +% = cheaper than base, -% = premium over base
  achievedIrrPct: number | null;
  iterations: number;
  converged: boolean;
  noteIfUnbounded?: string;
};

export type ImpliedBidSet = {
  basePriceKrw: number;
  baseBaseIrrPct: number | null;
  targetIrrPct: number;
  floorIrrPct: number;
  atTargetIrr: BidSolution; // solve base-IRR = target
  atP50TargetIrr: BidSolution; // solve MC P50 = target (more conservative)
  atP10FloorIrr: BidSolution; // solve MC P10 = floor (stress-resilient max price)
  breakEven: BidSolution; // solve base-IRR = 0
};

export type ImpliedBidOptions = {
  targetIrrPct?: number;
  floorIrrPct?: number;
  mcIterations?: number;
  mcSeed?: number;
  lowMultiplier?: number;
  highMultiplier?: number;
  maxBisectionSteps?: number;
  tolerancePriceKrw?: number;
};

// Evaluate a metric at a given purchase price.
type MetricEvaluator = (price: number) => number | null;

function baseLeveredIrrEvaluator(baseInputs: ProFormaInputs): MetricEvaluator {
  return (price: number) => {
    const inputs: ProFormaInputs = {
      ...baseInputs,
      purchasePriceKrw: price,
      year1Noi: Math.round((price * baseInputs.capRatePct) / 100)
    };
    const built = buildSyntheticProForma(inputs);
    const metrics = computeReturnMetricsFromProForma(
      built.proForma,
      built.extras.totalBasisKrw,
      built.proForma.summary.initialDebtFundingKrw,
      built.proForma.summary.netExitProceedsKrw,
      built.proForma.summary.terminalValueKrw
    );
    return metrics.equityIrr;
  };
}

function mcPercentileEvaluator(
  baseInputs: ProFormaInputs,
  percentile: 'p10' | 'p50',
  iterations: number,
  seed: number
): MetricEvaluator {
  return (price: number) => {
    const inputs: ProFormaInputs = {
      ...baseInputs,
      purchasePriceKrw: price,
      year1Noi: Math.round((price * baseInputs.capRatePct) / 100)
    };
    const mc = runMonteCarlo(inputs, { iterations, seed });
    return mc.leveredIrr[percentile];
  };
}

// Bisection: find price s.t. evaluator(price) ≈ targetIrr, assuming
// evaluator is monotone decreasing in price (higher price → lower IRR).
function bisect(
  evaluator: MetricEvaluator,
  targetIrr: number,
  lowPrice: number,
  highPrice: number,
  maxSteps: number,
  priceTol: number
): { price: number; irr: number | null; iterations: number; converged: boolean } {
  let lo = lowPrice;
  let hi = highPrice;
  let steps = 0;
  let midIrr: number | null = null;

  const loIrr = evaluator(lo);
  const hiIrr = evaluator(hi);

  // If both endpoints are on the same side of target, it's unbounded in our range.
  if (loIrr !== null && hiIrr !== null) {
    if (loIrr < targetIrr && hiIrr < targetIrr) {
      // Even at the cheapest price we can't hit target → return low bound.
      return { price: lo, irr: loIrr, iterations: 0, converged: false };
    }
    if (loIrr > targetIrr && hiIrr > targetIrr) {
      // Even at the most expensive price we beat target → return high bound.
      return { price: hi, irr: hiIrr, iterations: 0, converged: false };
    }
  }

  while (steps < maxSteps && hi - lo > priceTol) {
    const mid = Math.round((lo + hi) / 2);
    midIrr = evaluator(mid);
    if (midIrr === null) {
      // IRR can't be computed → treat as failure, narrow from the high side.
      hi = mid;
    } else if (midIrr >= targetIrr) {
      lo = mid; // can afford to pay more
    } else {
      hi = mid; // too expensive
    }
    steps++;
  }

  const finalPrice = Math.round((lo + hi) / 2);
  const finalIrr = evaluator(finalPrice);
  return {
    price: finalPrice,
    irr: finalIrr,
    iterations: steps,
    converged: hi - lo <= priceTol
  };
}

function toSolution(
  target: BidTarget,
  targetIrrPct: number | null,
  result: ReturnType<typeof bisect>,
  basePrice: number
): BidSolution {
  const discountPct = basePrice > 0 ? ((basePrice - result.price) / basePrice) * 100 : 0;
  const sol: BidSolution = {
    target,
    targetIrrPct,
    bidPriceKrw: result.price,
    basePriceKrw: basePrice,
    discountPct: Number(discountPct.toFixed(2)),
    achievedIrrPct: result.irr,
    iterations: result.iterations,
    converged: result.converged
  };
  if (!result.converged) {
    sol.noteIfUnbounded =
      result.iterations === 0
        ? 'Target unreachable in [30%, 200%] of base price — solution clamped to bound.'
        : 'Bisection exhausted step budget — price/IRR may be approximate.';
  }
  return sol;
}

export function solveImpliedBids(
  baseInputs: ProFormaInputs,
  options: ImpliedBidOptions = {}
): ImpliedBidSet {
  const targetIrr = options.targetIrrPct ?? 12;
  const floorIrr = options.floorIrrPct ?? 6;
  const mcIters = options.mcIterations ?? 400; // lower than primary MC to keep bisection fast
  const mcSeed = options.mcSeed ?? 42;
  const lowMul = options.lowMultiplier ?? 0.3;
  const highMul = options.highMultiplier ?? 2.0;
  const steps = options.maxBisectionSteps ?? 24;
  const priceTol = options.tolerancePriceKrw ?? 1_000_000; // 1M KRW

  const basePrice = baseInputs.purchasePriceKrw;
  const lo = Math.round(basePrice * lowMul);
  const hi = Math.round(basePrice * highMul);

  // Base IRR at the baseline price — for reporting only.
  const baseEval = baseLeveredIrrEvaluator(baseInputs);
  const baseBaseIrr = baseEval(basePrice);

  const atTargetResult = bisect(baseEval, targetIrr, lo, hi, steps, priceTol);
  const atP50Result = bisect(
    mcPercentileEvaluator(baseInputs, 'p50', mcIters, mcSeed),
    targetIrr,
    lo,
    hi,
    steps,
    priceTol
  );
  const atP10Result = bisect(
    mcPercentileEvaluator(baseInputs, 'p10', mcIters, mcSeed),
    floorIrr,
    lo,
    hi,
    steps,
    priceTol
  );
  const breakEvenResult = bisect(baseEval, 0, lo, hi, steps, priceTol);

  return {
    basePriceKrw: basePrice,
    baseBaseIrrPct: baseBaseIrr,
    targetIrrPct: targetIrr,
    floorIrrPct: floorIrr,
    atTargetIrr: toSolution('base_irr', targetIrr, atTargetResult, basePrice),
    atP50TargetIrr: toSolution('mc_p50_irr', targetIrr, atP50Result, basePrice),
    atP10FloorIrr: toSolution('mc_p10_irr', floorIrr, atP10Result, basePrice),
    breakEven: toSolution('break_even', null, breakEvenResult, basePrice)
  };
}
