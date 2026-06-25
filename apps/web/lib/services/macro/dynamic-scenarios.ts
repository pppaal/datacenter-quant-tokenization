import type { MacroFactor, MacroSeries } from '@prisma/client';

import { clamp } from '@/lib/math';
import type { MacroStressScenario } from '@/lib/services/macro/deal-risk';
import type { TrendAnalysis } from '@/lib/services/macro/trend';
import {
  estimateFactorCovariance,
  choleskyPsd,
  drawCorrelatedShock,
  mulberry32
} from '@/lib/services/macro/covariance';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DynamicScenarioContext = {
  market: string;
  factors: MacroFactor[];
  trends: TrendAnalysis[];
  /**
   * Optional MacroSeries history. When supplied with sufficient observations,
   * the tail-risk scenario draws genuine multi-σ correlated shocks instead of
   * hand-set constants.
   */
  series?: MacroSeries[];
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

type FactorLookup = Map<string, { value: number; direction: string; trendMomentum: number | null }>;

function buildFactorLookup(factors: MacroFactor[], market: string): FactorLookup {
  const map: FactorLookup = new Map();
  const sorted = [...factors]
    .filter((f) => f.market === market)
    .sort((a, b) => b.observationDate.getTime() - a.observationDate.getTime());

  for (const f of sorted) {
    if (!map.has(f.factorKey)) {
      map.set(f.factorKey, {
        value: f.value,
        direction: f.direction,
        trendMomentum: f.trendMomentum
      });
    }
  }
  return map;
}

function getTrendMomentum(trends: TrendAnalysis[], seriesKey: string): number {
  return trends.find((t) => t.seriesKey === seriesKey)?.momentum ?? 0;
}

// ---------------------------------------------------------------------------
// Dynamic scenario generation
// ---------------------------------------------------------------------------

/**
 * Generates a "most likely adverse" scenario based on current trend trajectories.
 * Instead of using fixed shocks, it projects where each factor is heading
 * and constructs shocks proportional to the observed momentum.
 */
export function generateTrendContinuationScenario(
  ctx: DynamicScenarioContext
): MacroStressScenario {
  const rateMomentum = getTrendMomentum(ctx.trends, 'policy_rate_pct');
  const creditMomentum = getTrendMomentum(ctx.trends, 'credit_spread_bps');
  const vacancyMomentum = getTrendMomentum(ctx.trends, 'vacancy_pct');
  const growthMomentum = getTrendMomentum(ctx.trends, 'rent_growth_pct');
  const constructionMomentum = getTrendMomentum(ctx.trends, 'construction_cost_index');

  // Project 6-month forward shocks based on current momentum × amplification factor
  const amplification = 3; // 6 months × trend slope, with uncertainty premium

  const rateShiftBps = clamp(Math.round(rateMomentum * amplification * 100), -50, 300);

  const spreadShiftBps = clamp(Math.round(creditMomentum * amplification), -30, 200);

  const vacancyShiftPct = clamp(Number((vacancyMomentum * amplification).toFixed(1)), -1, 5);

  const growthShiftPct = clamp(
    Number((-Math.abs(growthMomentum) * amplification).toFixed(1)),
    -3,
    0
  );

  const constructionCostShiftPct = clamp(
    Number((constructionMomentum * amplification).toFixed(1)),
    -5,
    20
  );

  const activeStresses: string[] = [];
  if (rateShiftBps > 50) activeStresses.push(`rates +${rateShiftBps}bps`);
  if (spreadShiftBps > 30) activeStresses.push(`spreads +${spreadShiftBps}bps`);
  if (vacancyShiftPct > 1.0) activeStresses.push(`vacancy +${vacancyShiftPct}pp`);
  if (growthShiftPct < -0.5) activeStresses.push(`growth ${growthShiftPct}pp`);
  if (constructionCostShiftPct > 3.0)
    activeStresses.push(`construction +${constructionCostShiftPct}%`);

  const description =
    activeStresses.length > 0
      ? `Current trends extended 6 months: ${activeStresses.join(', ')}`
      : 'Current trends project minimal stress over the next 6 months';

  return {
    name: 'Trend Continuation',
    description,
    shocks: {
      rateShiftBps: Math.max(rateShiftBps, 0),
      spreadShiftBps: Math.max(spreadShiftBps, 0),
      vacancyShiftPct: Math.max(vacancyShiftPct, 0),
      growthShiftPct: Math.min(growthShiftPct, 0),
      constructionCostShiftPct: Math.max(constructionCostShiftPct, 0)
    }
  };
}

// Shock dimensions in a fixed order, each mapped to its MacroSeries proxy and
// the sign that makes a draw "adverse" for that dimension.
//   rate / spread / vacancy / construction → adverse when they RISE  (+1)
//   growth → adverse when it FALLS (-1)
const TAIL_DIMENSIONS = [
  { seriesKey: 'policy_rate_pct', adverseSign: +1 },
  { seriesKey: 'credit_spread_bps', adverseSign: +1 },
  { seriesKey: 'vacancy_pct', adverseSign: +1 },
  { seriesKey: 'rent_growth_pct', adverseSign: -1 },
  { seriesKey: 'construction_cost_index', adverseSign: +1 }
] as const;

// Adverse severity in σ units for the correlated draw. ~2.3σ ≈ a 1-in-100
// adverse move per dimension before correlation reshapes the joint draw.
const TAIL_SIGMA_MULTIPLE = 2.3;
const TAIL_DRAW_SEED = 1337;

/**
 * Generates a "tail risk" scenario.
 *
 * When sufficient MacroSeries history is supplied (>= MIN_CHANGE_OBSERVATIONS
 * change observations across the tail dimensions), shocks are GENUINELY σ-based:
 * we estimate the covariance of factor changes, draw a correlated multi-σ
 * adverse vector via the reused PSD-safe Cholesky, and orient each component to
 * its adverse direction. Otherwise we fall back to the original hand-set
 * constants (labelled "Fixed adverse shocks" so the output stays honest).
 */
export function generateTailRiskScenario(ctx: DynamicScenarioContext): MacroStressScenario {
  const covariant = ctx.series ? tryCovarianceTailRisk(ctx) : null;
  if (covariant) return covariant;
  return fixedTailRiskScenario(ctx);
}

/**
 * Build the deterministic mean correlated adverse shock vector from a covariance
 * estimate. Exported for testing.
 *
 * The correlation structure is PRESERVED (this is the methodology fix). For each
 * Cholesky-correlated draw x ~ N(0, Σ) we orient the WHOLE vector toward the
 * aggregate adverse direction in one shot — by the sign of the projection
 *
 *   s = Σ_i adverseSign_i · x_i
 *
 * onto the adverse axis. When s < 0 we negate the ENTIRE vector (all components
 * flip together), so the joint sign relationships the Cholesky encoded survive:
 * two positively-correlated factors keep co-moving in the adverse draw, and
 * flipping a correlation sign changes the joint result. Averaging the so-oriented
 * draws over a deterministic ensemble gives the conditional mean of the joint
 * distribution on its adverse half-space — NOT the per-component half-normal mean
 * (the previous per-component `Math.abs` collapsed to independent marginals and
 * discarded every off-diagonal covariance term, making the "correlated draw"
 * claim false).
 */
export function buildCorrelatedAdverseShock(
  covariance: number[][],
  options?: { ensemble?: number; seed?: number; sigmaMultiple?: number }
): number[] {
  const dim = covariance.length;
  if (dim === 0) return [];
  const ensemble = options?.ensemble ?? 256;
  const seed = options?.seed ?? TAIL_DRAW_SEED;
  const sigmaMultiple = options?.sigmaMultiple ?? TAIL_SIGMA_MULTIPLE;

  // adverseSign per dimension; default +1 for dimensions beyond the tail set so
  // the helper is total for arbitrary covariance sizes (tests pass 2×2/3×3).
  const adverseSigns = Array.from(
    { length: dim },
    (_, i) => (TAIL_DIMENSIONS[i]?.adverseSign as number | undefined) ?? 1
  );
  const L = choleskyPsd(covariance);
  const rng = mulberry32(seed);
  const accum = new Array(dim).fill(0);

  for (let n = 0; n < ensemble; n++) {
    const draw = drawCorrelatedShock(L, rng);
    // Project the whole joint draw onto the adverse axis.
    let projection = 0;
    for (let i = 0; i < dim; i++) {
      projection += (adverseSigns[i] ?? 1) * (draw[i] ?? 0);
    }
    // Orient the ENTIRE vector toward its adverse half-space in one flip,
    // preserving the joint correlation structure across components.
    const orient = projection < 0 ? -1 : 1;
    for (let i = 0; i < dim; i++) {
      accum[i] += orient * (draw[i] ?? 0);
    }
  }

  // The conditional mean of the projection over its adverse half is ~0.8σ of the
  // projection scale; rescale the averaged oriented vector so the adverse axis
  // sits at ~sigmaMultiple σ, matching the documented tail severity.
  const meanFoldToSigma = sigmaMultiple / 0.7979;
  return accum.map((v) => (v / ensemble) * meanFoldToSigma);
}

function tryCovarianceTailRisk(ctx: DynamicScenarioContext): MacroStressScenario | null {
  const seriesKeys = TAIL_DIMENSIONS.map((d) => d.seriesKey);
  const estimate = estimateFactorCovariance(ctx.series ?? [], seriesKeys, ctx.market);
  if (!estimate.sufficient) return null;

  // Correlated adverse draw: orient the WHOLE joint vector toward the aggregate
  // adverse direction (preserving the off-diagonal covariance structure),
  // averaged over a deterministic, reproducible ensemble.
  const shock = buildCorrelatedAdverseShock(estimate.covariance);

  const [rateChg, spreadChg, vacancyChg, growthChg, constructionChg] = shock;

  // policy_rate is in %, the shock model expects bps → ×100. credit_spread is
  // already bps. vacancy / rent_growth in %, construction in index points (~%).
  const rateShiftBps = Math.max(0, Math.round(rateChg! * 100));
  const spreadShiftBps = Math.max(0, Math.round(spreadChg!));
  const vacancyShiftPct = Math.max(0, Number(vacancyChg!.toFixed(1)));
  const growthShiftPct = Math.min(0, Number(growthChg!.toFixed(1)));
  const constructionCostShiftPct = Math.max(0, Number(constructionChg!.toFixed(1)));

  const description =
    `Covariance-aware tail risk: correlated ${TAIL_SIGMA_MULTIPLE}σ adverse draw from ` +
    `${estimate.observationCount} change observations (shrinkage δ=${estimate.shrinkageIntensity.toFixed(2)}). ` +
    `σ-based shocks via PSD-safe Cholesky.`;

  return {
    name: 'Dynamic Tail Risk',
    description,
    shocks: {
      rateShiftBps,
      spreadShiftBps,
      vacancyShiftPct,
      growthShiftPct,
      constructionCostShiftPct
    }
  };
}

/**
 * Original fixed-constant tail-risk scenario. The shock magnitudes are hand-set
 * constants (e.g. 250bps on rates when stressed), NOT computed σ moves.
 */
function fixedTailRiskScenario(ctx: DynamicScenarioContext): MacroStressScenario {
  const lookup = buildFactorLookup(ctx.factors, ctx.market);

  const rateDir = lookup.get('rate_level')?.direction ?? 'NEUTRAL';
  const creditDir = lookup.get('credit_stress')?.direction ?? 'NEUTRAL';
  const demandDir = lookup.get('property_demand')?.direction ?? 'NEUTRAL';
  const constructionDir = lookup.get('construction_pressure')?.direction ?? 'NEUTRAL';

  // Apply larger fixed adverse shocks on already-stressed dimensions. These
  // are hand-set constants, not 2σ moves derived from the data.
  const rateShiftBps = rateDir === 'NEGATIVE' ? 250 : 100;
  const spreadShiftBps = creditDir === 'NEGATIVE' ? 200 : 75;
  const vacancyShiftPct = demandDir === 'NEGATIVE' ? 4.0 : 1.5;
  const growthShiftPct = demandDir === 'NEGATIVE' ? -2.5 : -1.0;
  const constructionCostShiftPct = constructionDir === 'NEGATIVE' ? 18.0 : 5.0;

  const headwinds: string[] = [];
  if (rateDir === 'NEGATIVE') headwinds.push('rates');
  if (creditDir === 'NEGATIVE') headwinds.push('credit');
  if (demandDir === 'NEGATIVE') headwinds.push('demand');
  if (constructionDir === 'NEGATIVE') headwinds.push('construction');

  const description =
    headwinds.length > 0
      ? `Tail-risk stress centered on current headwinds: ${headwinds.join(', ')}. Fixed adverse shocks applied.`
      : 'Baseline tail-risk scenario with moderate fixed shocks across all dimensions.';

  return {
    name: 'Dynamic Tail Risk',
    description,
    shocks: {
      rateShiftBps,
      spreadShiftBps,
      vacancyShiftPct,
      growthShiftPct,
      constructionCostShiftPct
    }
  };
}

/**
 * Returns all dynamic scenarios (trend continuation + tail risk)
 * alongside the existing static scenarios.
 */
export function generateDynamicScenarios(ctx: DynamicScenarioContext): MacroStressScenario[] {
  return [generateTrendContinuationScenario(ctx), generateTailRiskScenario(ctx)];
}
