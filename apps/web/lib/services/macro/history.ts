import type { MacroImpactDirection, MacroImpactDimension } from '@/lib/services/macro/impact';
import type { MacroInterpretation } from '@/lib/services/macro/regime';

type MacroHistoryRun = {
  id: string;
  runLabel: string;
  createdAt: Date;
  assumptions: unknown;
};

export type MacroImpactHistoryPoint = {
  runId: string;
  runLabel: string;
  createdAt: Date;
  dimensions: Record<
    MacroImpactDimension['key'],
    {
      score: number;
      direction: MacroImpactDirection;
    }
  >;
};

export type MacroImpactHistorySeries = {
  key: MacroImpactDimension['key'];
  label: string;
  latestScore: number | null;
  deltaVsPrevious: number | null;
  latestDirection: MacroImpactDirection | null;
  points: Array<{
    runId: string;
    runLabel: string;
    createdAt: Date;
    score: number;
    direction: MacroImpactDirection;
  }>;
};

export type MacroImpactHistory = {
  asOf: Date | null;
  points: MacroImpactHistoryPoint[];
  series: MacroImpactHistorySeries[];
};

const DIMENSION_ORDER: Array<{ key: MacroImpactDimension['key']; label: string }> = [
  { key: 'pricing', label: 'Entry and Exit Pricing' },
  { key: 'leasing', label: 'Leasing and Revenue' },
  { key: 'financing', label: 'Financing Cost' },
  { key: 'construction', label: 'Construction and Replacement Cost' },
  { key: 'refinancing', label: 'Refinancing and Exit Liquidity' },
  { key: 'allocation', label: 'Cross-Asset Allocation' }
];

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

export function buildMacroImpactHistory(runs: MacroHistoryRun[], take = 6): MacroImpactHistory {
  const points = runs
    .map((run) => {
      const macroRegime = extractMacroRegime(run.assumptions);
      if (!macroRegime) return null;

      const dimensions = Object.fromEntries(
        macroRegime.impacts.dimensions.map((dimension) => [
          dimension.key,
          {
            score: dimension.score,
            direction: dimension.direction
          }
        ])
      ) as MacroImpactHistoryPoint['dimensions'];

      return {
        runId: run.id,
        runLabel: run.runLabel,
        createdAt: run.createdAt,
        dimensions
      };
    })
    .filter((point): point is MacroImpactHistoryPoint => point !== null)
    .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
    .slice(-take);

  const series = DIMENSION_ORDER.map(({ key, label }) => {
    const dimensionPoints = points
      .map((point) => {
        const dimension = point.dimensions[key];
        if (!dimension) return null;
        return {
          runId: point.runId,
          runLabel: point.runLabel,
          createdAt: point.createdAt,
          score: dimension.score,
          direction: dimension.direction
        };
      })
      .filter((point): point is NonNullable<typeof point> => point !== null);

    const latest = dimensionPoints.at(-1) ?? null;
    const previous = dimensionPoints.at(-2) ?? null;

    return {
      key,
      label,
      latestScore: latest?.score ?? null,
      deltaVsPrevious:
        latest && previous ? round(latest.score - previous.score) : null,
      latestDirection: latest?.direction ?? null,
      points: dimensionPoints
    } satisfies MacroImpactHistorySeries;
  });

  return {
    asOf: points.at(-1)?.createdAt ?? null,
    points,
    series
  };
}
