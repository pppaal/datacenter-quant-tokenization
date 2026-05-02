/**
 * Pipeline supply-demand model for KR DC submarkets (and adaptable
 * to office / industrial). Translates a pipeline project list into
 * a probability-weighted supply forecast and pairs it with a
 * demand assumption to derive vacancy / occupancy paths.
 *
 * The "moat" piece for KR DC: stage-aware probability-weighted
 * supply vs externally-supplied demand growth, so the IM /
 * research output can show "Year 2028 expected supply 480 MW vs
 * demand 540 MW → 11% vacancy tightening".
 *
 * Pure function, no DB / IO.
 */

export type PipelineStageLabel =
  | 'ANNOUNCED'
  | 'FEASIBILITY'
  | 'PERMITTED'
  | 'PRE_CONSTRUCTION'
  | 'UNDER_CONSTRUCTION'
  | 'TOPPING_OUT'
  | 'COMMISSIONING'
  | 'DELIVERED';

/**
 * Default completion probabilities by stage. These reflect
 * typical KR DC delivery rates from announcement to live load:
 * roughly 30% of "announced" projects ever break ground; ~95%
 * of "topping out" projects deliver within 6-12 months.
 *
 * Override per-deal via `stageProbabilities` arg if a sponsor or
 * submarket has materially different historic completion rates.
 */
export const DEFAULT_STAGE_COMPLETION_PROB: Record<PipelineStageLabel, number> = {
  ANNOUNCED: 0.30,
  FEASIBILITY: 0.45,
  PERMITTED: 0.65,
  PRE_CONSTRUCTION: 0.75,
  UNDER_CONSTRUCTION: 0.90,
  TOPPING_OUT: 0.95,
  COMMISSIONING: 0.98,
  DELIVERED: 1.0
};

export type PipelineProjectInput = {
  projectName: string;
  stageLabel: PipelineStageLabel | string | null | undefined;
  /** Power capacity (MW) — primary unit for DC. */
  expectedPowerMw?: number | null;
  /** Floor area (sqm) — primary unit for office / industrial. */
  expectedAreaSqm?: number | null;
  /** Expected delivery date — used to bucket into a horizon year. */
  expectedDeliveryDate?: Date | string | null;
  sponsorName?: string | null;
};

export type SupplyHorizonRow = {
  year: number;
  /** Total nameplate (MW or sqm) of projects scheduled to deliver this year. */
  nameplate: number;
  /** Probability-weighted expected delivery this year. */
  expected: number;
  /** Number of projects in the bucket. */
  projectCount: number;
};

export type DemandPath = {
  /** Year-anchor demand level in same unit as supply (MW or sqm). */
  baselineDemand: number;
  /** Annual demand growth percent (e.g. 8 = +8%/yr). */
  growthPct: number;
  /** First year of the horizon (defaults to current year). */
  baseYear?: number;
};

export type SupplyDemandRow = {
  year: number;
  expectedSupplyDelta: number;
  cumulativeSupply: number;
  expectedDemand: number;
  /** Demand minus supply (positive = tightening, negative = oversupply). */
  netAbsorption: number;
  /** Implied vacancy approximation = (supply - demand) / supply, clamped. */
  impliedVacancyPct: number;
};

export type SupplyDemandModel = {
  unit: 'MW' | 'sqm';
  horizonYears: number;
  supplyByYear: SupplyHorizonRow[];
  supplyDemand: SupplyDemandRow[];
  /** Year-1 supply pipeline expressed as % of starting supply. */
  pipelineIntensityPct: number;
};

const DEFAULT_HORIZON_YEARS = 5;

function normalizeStage(s: string | null | undefined): PipelineStageLabel | null {
  if (!s) return null;
  const upper = s.toUpperCase().replace(/[\s-]+/g, '_');
  const known = Object.keys(DEFAULT_STAGE_COMPLETION_PROB) as PipelineStageLabel[];
  if (known.includes(upper as PipelineStageLabel)) {
    return upper as PipelineStageLabel;
  }
  // Common aliases
  if (upper.startsWith('PLANNED')) return 'ANNOUNCED';
  if (upper.includes('CONSTRUCTION') && upper.includes('PRE')) return 'PRE_CONSTRUCTION';
  if (upper.includes('CONSTRUCTION')) return 'UNDER_CONSTRUCTION';
  if (upper.includes('PERMIT')) return 'PERMITTED';
  return null;
}

function deliveryYear(input: Date | string | null | undefined): number | null {
  if (!input) return null;
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  return d.getUTCFullYear();
}

/**
 * Build the year-by-year probability-weighted supply forecast.
 * Projects without a delivery date are dropped. Stage label
 * defaults to ANNOUNCED if unrecognized so the project isn't
 * silently excluded.
 */
export function buildSupplyForecast(
  projects: PipelineProjectInput[],
  options: {
    unit: 'MW' | 'sqm';
    baseYear?: number;
    horizonYears?: number;
    stageProbabilities?: Partial<Record<PipelineStageLabel, number>>;
  }
): SupplyHorizonRow[] {
  const baseYear = options.baseYear ?? new Date().getUTCFullYear();
  const horizon = options.horizonYears ?? DEFAULT_HORIZON_YEARS;
  const probs: Record<PipelineStageLabel, number> = {
    ...DEFAULT_STAGE_COMPLETION_PROB,
    ...(options.stageProbabilities ?? {})
  };

  const buckets = new Map<number, SupplyHorizonRow>();
  for (let i = 0; i <= horizon; i += 1) {
    buckets.set(baseYear + i, {
      year: baseYear + i,
      nameplate: 0,
      expected: 0,
      projectCount: 0
    });
  }

  for (const p of projects) {
    const yr = deliveryYear(p.expectedDeliveryDate);
    if (yr === null) continue;
    if (yr < baseYear || yr > baseYear + horizon) continue;
    const stage = normalizeStage(p.stageLabel ?? null) ?? 'ANNOUNCED';
    const prob = probs[stage] ?? DEFAULT_STAGE_COMPLETION_PROB[stage] ?? 0.5;
    const cap =
      options.unit === 'MW'
        ? p.expectedPowerMw ?? 0
        : p.expectedAreaSqm ?? 0;
    if (cap <= 0) continue;
    const row = buckets.get(yr)!;
    row.nameplate += cap;
    row.expected += cap * prob;
    row.projectCount += 1;
  }

  return Array.from(buckets.values()).sort((a, b) => a.year - b.year);
}

/**
 * Pair the supply forecast with a demand path and produce per-year
 * net absorption + implied vacancy. Vacancy formula (simplified):
 *   vacancy ≈ max(0, 1 - demand / cumulative_supply)
 */
export function buildSupplyDemand(
  projects: PipelineProjectInput[],
  options: {
    unit: 'MW' | 'sqm';
    baseYear?: number;
    horizonYears?: number;
    stageProbabilities?: Partial<Record<PipelineStageLabel, number>>;
    /** Total in-place supply at base year (already-delivered capacity). */
    startingSupply: number;
    demand: DemandPath;
  }
): SupplyDemandModel {
  const supplyByYear = buildSupplyForecast(projects, options);
  const baseYear = options.baseYear ?? new Date().getUTCFullYear();
  const horizon = options.horizonYears ?? DEFAULT_HORIZON_YEARS;
  const demandBase = options.demand.baseYear ?? baseYear;

  let cumulative = options.startingSupply;
  const supplyDemand: SupplyDemandRow[] = [];
  for (let i = 0; i <= horizon; i += 1) {
    const yr = baseYear + i;
    const supplyRow = supplyByYear.find((r) => r.year === yr);
    const delta = supplyRow ? supplyRow.expected : 0;
    cumulative += delta;
    const yearsFromDemandBase = yr - demandBase;
    const expectedDemand =
      options.demand.baselineDemand *
      Math.pow(1 + options.demand.growthPct / 100, yearsFromDemandBase);
    const net = expectedDemand - cumulative;
    const impliedVacancy =
      cumulative > 0
        ? Math.max(0, Math.min(1, 1 - expectedDemand / cumulative))
        : 0;
    supplyDemand.push({
      year: yr,
      expectedSupplyDelta: round2(delta),
      cumulativeSupply: round2(cumulative),
      expectedDemand: round2(expectedDemand),
      netAbsorption: round2(net),
      impliedVacancyPct: round2(impliedVacancy * 100)
    });
  }

  // Pipeline intensity = year-1 supply delta / starting supply
  const yearOne = supplyDemand[1] ?? supplyDemand[0]!;
  const pipelineIntensityPct =
    options.startingSupply > 0
      ? round2((yearOne.expectedSupplyDelta / options.startingSupply) * 100)
      : 0;

  return {
    unit: options.unit,
    horizonYears: horizon,
    supplyByYear,
    supplyDemand,
    pipelineIntensityPct
  };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
