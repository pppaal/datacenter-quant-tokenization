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

  // Assign each role (Bull / Base / Bear) to a DISTINCT scenario. Prefer the
  // explicit name match; for any role left unmatched, fall back to a valuation
  // ranking over the not-yet-claimed scenarios (highest = Bull, lowest = Bear,
  // remaining = Base). The previous positional `scenarios[Math.min(1, ...)]`
  // base fallback could collapse Base onto the matched Bull/Bear — emitting
  // the same scenario twice with a meaningless 0% delta.
  const claimed = new Set<ScenarioLike>();
  const claim = (row: ScenarioLike | null): ScenarioLike | null => {
    if (!row || claimed.has(row)) return null;
    claimed.add(row);
    return row;
  };

  let bull = claim(findByPrefix(scenarios, 'bull'));
  let bear = claim(findByPrefix(scenarios, 'bear'));
  let base = claim(findByPrefix(scenarios, 'base'));

  // Fill unmatched roles from the remaining scenarios by valuation rank.
  const unclaimedByValue = scenarios
    .filter((s) => !claimed.has(s))
    .sort((a, b) => b.valuationKrw - a.valuationKrw);
  if (!bull && unclaimedByValue.length > 0) bull = claim(unclaimedByValue.shift()!);
  if (!bear && unclaimedByValue.length > 0) bear = claim(unclaimedByValue.pop()!);
  if (!base && unclaimedByValue.length > 0) base = claim(unclaimedByValue.shift()!);

  // When fewer than three distinct scenarios exist, Base anchors on whatever
  // remains (bull/bear first, else the only scenario) so deltas stay defined.
  const resolvedBase = base ?? bull ?? bear ?? scenarios[0]!;
  return emitRows(bull, resolvedBase, bear);
}

function emitRows(
  bull: ScenarioLike | null,
  base: ScenarioLike,
  bear: ScenarioLike | null
): ScenarioDiffRow[] {
  const order: Array<{ key: string; row: ScenarioLike | null }> = [
    { key: 'Bull', row: bull },
    { key: 'Base', row: base },
    { key: 'Bear', row: bear }
  ];

  // Never emit the same scenario object under two labels (e.g. a single- or
  // two-scenario set where Base falls back onto Bull/Bear). Dedupe by first
  // occurrence in display order so Bull/Bear stay visible; every delta is
  // still computed relative to `base`.
  const seen = new Set<ScenarioLike>();
  return order
    .filter(({ row }) => {
      if (row === null) return false;
      if (seen.has(row)) return false;
      seen.add(row);
      return true;
    })
    .map(({ key, row }) => {
      const r = row!;
      const valueDeltaPct =
        base.valuationKrw > 0
          ? ((r.valuationKrw - base.valuationKrw) / base.valuationKrw) * 100
          : 0;
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
