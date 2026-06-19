import type { UnderwritingScenario } from '@/lib/services/valuation/types';

type ScenarioLike = {
  name: string;
  scenarioOrder?: number | null;
  debtServiceCoverage?: number | null;
};

type ScenarioOutputInput = {
  name: UnderwritingScenario['name'];
  valuationKrw: number;
  impliedYieldPct: number;
  exitCapRatePct: number;
  debtServiceCoverage: number;
  notes: string;
  scenarioOrder: number;
};

export function sortScenariosByOrder<T extends ScenarioLike>(scenarios: T[]): T[] {
  return [...scenarios].sort(
    (left, right) =>
      (left.scenarioOrder ?? Number.MAX_SAFE_INTEGER) -
      (right.scenarioOrder ?? Number.MAX_SAFE_INTEGER)
  );
}

export function findScenarioByName<T extends ScenarioLike>(
  scenarios: T[],
  name: string
): T | undefined {
  return scenarios.find((scenario) => scenario.name.toLowerCase() === name.toLowerCase());
}

export function pickBaseScenario<T extends ScenarioLike>(scenarios: T[]): T | undefined {
  return findScenarioByName(scenarios, 'Base') ?? sortScenariosByOrder(scenarios)[0];
}

export function pickBaseDscr(scenarios: ScenarioLike[]): number | null {
  const baseScenario = pickBaseScenario(scenarios);
  return typeof baseScenario?.debtServiceCoverage === 'number'
    ? baseScenario.debtServiceCoverage
    : null;
}

/**
 * Bull / bear headline values resolved by valuation magnitude (highest = bull,
 * lowest = bear), not by array position — positional `[0]`/`[2]` printed
 * identical bull=bear for 1–2-scenario runs and could swap labels on reorder.
 */
export function resolveBullBearValues(scenarios: Array<{ valuationKrw?: number | null }>): {
  bull: number | null;
  bear: number | null;
} {
  const values = scenarios
    .map((scenario) => scenario.valuationKrw)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (values.length === 0) return { bull: null, bear: null };
  return { bull: Math.max(...values), bear: Math.min(...values) };
}

export function buildScenarioOutput(input: ScenarioOutputInput): UnderwritingScenario {
  return {
    name: input.name,
    valuationKrw: Math.max(1, Math.round(input.valuationKrw)),
    impliedYieldPct: Number(input.impliedYieldPct.toFixed(2)),
    exitCapRatePct: Number(input.exitCapRatePct.toFixed(2)),
    debtServiceCoverage: Number(input.debtServiceCoverage.toFixed(2)),
    notes: input.notes,
    scenarioOrder: input.scenarioOrder
  };
}

export function buildOrderedScenarioOutputs(inputs: ScenarioOutputInput[]): UnderwritingScenario[] {
  return sortScenariosByOrder(inputs.map((input) => buildScenarioOutput(input)));
}
