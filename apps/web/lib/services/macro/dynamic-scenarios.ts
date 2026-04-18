import type { MacroFactor } from '@prisma/client';
import type { MacroStressScenario } from '@/lib/services/macro/deal-risk';
import type { TrendAnalysis } from '@/lib/services/macro/trend';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DynamicScenarioContext = {
  market: string;
  factors: MacroFactor[];
  trends: TrendAnalysis[];
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

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getTrendDirection(trends: TrendAnalysis[], seriesKey: string): string {
  return trends.find((t) => t.seriesKey === seriesKey)?.direction ?? 'FLAT';
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
export function generateTrendContinuationScenario(ctx: DynamicScenarioContext): MacroStressScenario {
  const lookup = buildFactorLookup(ctx.factors, ctx.market);

  const rateTrend = getTrendDirection(ctx.trends, 'policy_rate_pct');
  const rateMomentum = getTrendMomentum(ctx.trends, 'policy_rate_pct');
  const creditTrend = getTrendDirection(ctx.trends, 'credit_spread_bps');
  const creditMomentum = getTrendMomentum(ctx.trends, 'credit_spread_bps');
  const vacancyTrend = getTrendDirection(ctx.trends, 'vacancy_pct');
  const vacancyMomentum = getTrendMomentum(ctx.trends, 'vacancy_pct');
  const growthTrend = getTrendDirection(ctx.trends, 'rent_growth_pct');
  const growthMomentum = getTrendMomentum(ctx.trends, 'rent_growth_pct');
  const constructionTrend = getTrendDirection(ctx.trends, 'construction_cost_index');
  const constructionMomentum = getTrendMomentum(ctx.trends, 'construction_cost_index');

  // Project 6-month forward shocks based on current momentum × amplification factor
  const amplification = 3; // 6 months × trend slope, with uncertainty premium

  const rateShiftBps = clamp(
    Math.round(rateMomentum * amplification * 100),
    -50,
    300
  );

  const spreadShiftBps = clamp(
    Math.round(creditMomentum * amplification),
    -30,
    200
  );

  const vacancyShiftPct = clamp(
    Number((vacancyMomentum * amplification).toFixed(1)),
    -1,
    5
  );

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
  if (constructionCostShiftPct > 3.0) activeStresses.push(`construction +${constructionCostShiftPct}%`);

  const description = activeStresses.length > 0
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

/**
 * Generates a "tail risk" scenario: takes current headwinds and
 * applies a 2-sigma shock on each adverse factor.
 */
export function generateTailRiskScenario(ctx: DynamicScenarioContext): MacroStressScenario {
  const lookup = buildFactorLookup(ctx.factors, ctx.market);

  const rateDir = lookup.get('rate_level')?.direction ?? 'NEUTRAL';
  const creditDir = lookup.get('credit_stress')?.direction ?? 'NEUTRAL';
  const demandDir = lookup.get('property_demand')?.direction ?? 'NEUTRAL';
  const constructionDir = lookup.get('construction_pressure')?.direction ?? 'NEUTRAL';

  // Amplify shocks on already-stressed dimensions
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

  const description = headwinds.length > 0
    ? `Tail-risk stress centered on current headwinds: ${headwinds.join(', ')}. 2σ adverse shocks applied.`
    : 'Baseline tail-risk scenario with moderate shocks across all dimensions.';

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
  return [
    generateTrendContinuationScenario(ctx),
    generateTailRiskScenario(ctx)
  ];
}
