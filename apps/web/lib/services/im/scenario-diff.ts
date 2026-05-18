/**
 * Compute Bull / Base / Bear scenario shifts from the persisted
 * ValuationScenario rows. Real REPE IMs explain HOW the bull and
 * bear cases differ from base — not just "+30% / -33%". The user
 * needs to see WHICH lever moved (cap rate +/- 50bps, exit cap +/-
 * 35bps, DSCR floor breach, etc.).
 */
type ScenarioLike = {
  name: string;
  valuationKrw: number;
  impliedYieldPct: number | null;
  exitCapRatePct: number | null;
  debtServiceCoverage: number | null;
  notes: string;
};

export type ScenarioDiffRow = {
  name: 'Bull' | 'Base' | 'Bear' | string;
  valuationKrw: number;
  valueDeltaPct: number;
  impliedYieldPct: number | null;
  impliedYieldDeltaBps: number | null;
  exitCapRatePct: number | null;
  exitCapDeltaBps: number | null;
  debtServiceCoverage: number | null;
  dscrDelta: number | null;
  notes: string;
};

function findByPrefix(scenarios: ScenarioLike[], needle: string): ScenarioLike | null {
  const target = needle.toLowerCase();
  return scenarios.find((s) => s.name.toLowerCase().includes(target)) ?? null;
}

export function buildScenarioDiff(scenarios: ScenarioLike[]): ScenarioDiffRow[] {
  if (scenarios.length === 0) return [];
  const base =
    findByPrefix(scenarios, 'base') ?? scenarios[Math.min(1, scenarios.length - 1)] ?? scenarios[0];
  if (!base) return [];

  const order: Array<{ key: string; row: ScenarioLike | null }> = [
    { key: 'Bull', row: findByPrefix(scenarios, 'bull') },
    { key: 'Base', row: base },
    { key: 'Bear', row: findByPrefix(scenarios, 'bear') }
  ];

  return order
    .filter(({ row }) => row !== null)
    .map(({ key, row }) => {
      const r = row!;
      const valueDeltaPct =
        base.valuationKrw > 0 ? ((r.valuationKrw - base.valuationKrw) / base.valuationKrw) * 100 : 0;
      const impliedYieldDeltaBps =
        r.impliedYieldPct !== null && base.impliedYieldPct !== null
          ? Math.round((r.impliedYieldPct - base.impliedYieldPct) * 100)
          : null;
      const exitCapDeltaBps =
        r.exitCapRatePct !== null && base.exitCapRatePct !== null
          ? Math.round((r.exitCapRatePct - base.exitCapRatePct) * 100)
          : null;
      const dscrDelta =
        r.debtServiceCoverage !== null && base.debtServiceCoverage !== null
          ? Number((r.debtServiceCoverage - base.debtServiceCoverage).toFixed(2))
          : null;
      return {
        name: key,
        valuationKrw: r.valuationKrw,
        valueDeltaPct: Number(valueDeltaPct.toFixed(2)),
        impliedYieldPct: r.impliedYieldPct,
        impliedYieldDeltaBps,
        exitCapRatePct: r.exitCapRatePct,
        exitCapDeltaBps,
        debtServiceCoverage: r.debtServiceCoverage,
        dscrDelta,
        notes: r.notes
      };
    });
}
