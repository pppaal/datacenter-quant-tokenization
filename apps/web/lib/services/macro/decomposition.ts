import type { MacroImpactDirection } from '@/lib/services/macro/impact';
import type { MacroInterpretation } from '@/lib/services/macro/regime';

type MacroHistoryRun = {
  id: string;
  runLabel: string;
  createdAt: Date;
  assumptions: unknown;
};

export type MacroDecomposition = {
  currentRunId: string;
  previousRunId: string | null;
  previousRunLabel: string | null;
  previousCreatedAt: Date | null;
  summary: string[];
  guidanceChanges: Array<{
    key: string;
    label: string;
    unit: 'pts' | '%';
    currentValue: number | null;
    previousValue: number | null;
    delta: number | null;
  }>;
  impactChanges: Array<{
    key: string;
    label: string;
    currentScore: number;
    previousScore: number | null;
    delta: number | null;
    currentDirection: MacroImpactDirection;
    previousDirection: MacroImpactDirection | null;
  }>;
  factorDrivers: Array<{
    key: string;
    label: string;
    currentValue: number | null;
    previousValue: number | null;
    delta: number | null;
    currentDirection: string;
    previousDirection: string | null;
    isObserved: boolean;
    changed: boolean;
    commentary: string;
  }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function extractMacroRegime(assumptions: unknown): MacroInterpretation | null {
  if (!isRecord(assumptions)) return null;
  const macroRegime = assumptions.macroRegime;
  if (!isRecord(macroRegime) || !isRecord(macroRegime.impacts)) return null;
  if (!Array.isArray(macroRegime.impacts.dimensions)) return null;
  return macroRegime as unknown as MacroInterpretation;
}

function round(value: number) {
  return Number(value.toFixed(2));
}

function compareNullable(current: number | null, previous: number | null) {
  if (current === null || previous === null) return null;
  return round(current - previous);
}

function getGuidanceValue(
  regime: MacroInterpretation | null,
  key: (typeof GUIDANCE_ORDER)[number][0]
) {
  const guidance = regime?.guidance;
  if (!guidance || typeof guidance !== 'object') return null;
  const value = guidance[key];
  return typeof value === 'number' ? value : null;
}

function getImpactDimensions(regime: MacroInterpretation | null) {
  return Array.isArray(regime?.impacts?.dimensions) ? regime.impacts.dimensions : [];
}

function getFactorList(regime: MacroInterpretation | null) {
  return Array.isArray(regime?.factors) ? regime.factors : [];
}

const GUIDANCE_ORDER = [
  ['discountRateShiftPct', 'Discount Rate', 'pts'],
  ['exitCapRateShiftPct', 'Exit Cap', 'pts'],
  ['debtCostShiftPct', 'Debt Cost', 'pts'],
  ['occupancyShiftPct', 'Occupancy', 'pts'],
  ['growthShiftPct', 'Growth', 'pts'],
  ['replacementCostShiftPct', 'Replacement Cost', '%']
] as const;

export function buildMacroDecomposition(
  currentRunId: string,
  current: MacroInterpretation | null,
  runs: MacroHistoryRun[]
): MacroDecomposition | null {
  if (!current) return null;

  const previousRun = runs
    .filter((run) => run.id !== currentRunId)
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .find((run) => extractMacroRegime(run.assumptions) !== null);

  const previous = previousRun ? extractMacroRegime(previousRun.assumptions) : null;

  const guidanceChanges = GUIDANCE_ORDER.map(([key, label, unit]) => {
    const currentValue = getGuidanceValue(current, key);
    const previousValue = getGuidanceValue(previous, key);

    return {
      key,
      label,
      unit,
      currentValue: currentValue === null ? null : round(currentValue),
      previousValue: previousValue === null ? null : round(previousValue),
      delta: compareNullable(currentValue, previousValue)
    };
  });

  const impactChanges = getImpactDimensions(current).map((dimension) => {
    const previousDimension =
      getImpactDimensions(previous).find((item) => item.key === dimension.key) ?? null;
    return {
      key: dimension.key,
      label: dimension.label,
      currentScore: round(dimension.score),
      previousScore: previousDimension ? round(previousDimension.score) : null,
      delta: compareNullable(
        round(dimension.score),
        previousDimension ? round(previousDimension.score) : null
      ),
      currentDirection: dimension.direction,
      previousDirection: previousDimension?.direction ?? null
    };
  });

  const factorDrivers = getFactorList(current)
    .map((factor) => {
      const previousFactor =
        getFactorList(previous).find((item) => item.key === factor.key) ?? null;
      const currentValue = factor.isObserved ? factor.value : null;
      const previousValue = previousFactor?.isObserved ? previousFactor.value : null;
      const delta = compareNullable(currentValue, previousValue);
      const changed =
        delta !== null
          ? Math.abs(delta) > 0.01
          : currentValue !== previousValue || factor.direction !== previousFactor?.direction;

      return {
        key: factor.key,
        label: factor.label,
        currentValue,
        previousValue,
        delta,
        currentDirection: factor.direction,
        previousDirection: previousFactor?.direction ?? null,
        isObserved: factor.isObserved,
        changed,
        commentary: factor.commentary
      };
    })
    .filter((factor) => factor.changed)
    .sort((left, right) => {
      const leftScore =
        left.delta !== null
          ? Math.abs(left.delta)
          : left.currentDirection === left.previousDirection
            ? 0
            : 999;
      const rightScore =
        right.delta !== null
          ? Math.abs(right.delta)
          : right.currentDirection === right.previousDirection
            ? 0
            : 999;
      return rightScore - leftScore;
    })
    .slice(0, 6);

  const widestMove =
    [...guidanceChanges]
      .filter((item) => item.delta !== null)
      .sort((left, right) => Math.abs(right.delta ?? 0) - Math.abs(left.delta ?? 0))[0] ?? null;
  const biggestImpact =
    [...impactChanges]
      .filter((item) => item.delta !== null)
      .sort((left, right) => Math.abs(right.delta ?? 0) - Math.abs(left.delta ?? 0))[0] ?? null;
  const topDriver = factorDrivers[0] ?? null;

  const summary = [
    widestMove
      ? `${widestMove.label} moved ${widestMove.delta! > 0 ? 'up' : 'down'} ${Math.abs(widestMove.delta!)}${widestMove.unit}.`
      : 'No prior guidance baseline available yet.',
    biggestImpact
      ? `${biggestImpact.label} changed ${biggestImpact.delta! > 0 ? 'toward tailwind' : 'toward headwind'} by ${Math.abs(biggestImpact.delta!)}.`
      : 'No prior impact comparison available yet.',
    topDriver
      ? `${topDriver.label} is the main factor driver in the latest interpretation shift.`
      : 'No material factor driver change detected.'
  ];

  return {
    currentRunId,
    previousRunId: previousRun?.id ?? null,
    previousRunLabel: previousRun?.runLabel ?? null,
    previousCreatedAt: previousRun?.createdAt ?? null,
    summary,
    guidanceChanges,
    impactChanges,
    factorDrivers
  };
}
