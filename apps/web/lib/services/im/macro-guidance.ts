/**
 * Read the macro-regime-engine guidance entry from the persisted
 * provenance array. The engine writes a single `macro.guidance`
 * provenance row whose `value` is a JSON string carrying the per-
 * dimension shifts it applied (cap rate, debt cost, occupancy, etc.)
 * plus a 6-line narrative summary. The IM surfaces those numerically
 * so the LP can see HOW the regime engine moved the base inputs.
 */
type ProvenanceEntry = {
  field: string;
  sourceSystem?: string;
  value?: unknown;
  freshnessLabel?: string;
};

export type MacroGuidance = {
  shifts: {
    discountRateShiftPct: number | null;
    exitCapRateShiftPct: number | null;
    debtCostShiftPct: number | null;
    occupancyShiftPct: number | null;
    growthShiftPct: number | null;
    replacementCostShiftPct: number | null;
  };
  weightLine: string;
  summary: string[];
};

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function asEntries(provenance: unknown): ProvenanceEntry[] {
  if (!Array.isArray(provenance)) return [];
  return provenance.filter(
    (e): e is ProvenanceEntry =>
      !!e && typeof e === 'object' && typeof (e as ProvenanceEntry).field === 'string'
  );
}

export function readMacroGuidance(provenance: unknown): MacroGuidance | null {
  const entries = asEntries(provenance);
  const guidanceEntry = entries.find((e) => e.field === 'macro.guidance');
  if (!guidanceEntry) return null;

  const valueRaw = guidanceEntry.value;
  let parsed: Record<string, unknown> | null = null;
  if (typeof valueRaw === 'string') {
    try {
      const parsedJson = JSON.parse(valueRaw);
      if (parsedJson && typeof parsedJson === 'object' && !Array.isArray(parsedJson)) {
        parsed = parsedJson as Record<string, unknown>;
      }
    } catch {
      parsed = null;
    }
  } else if (valueRaw && typeof valueRaw === 'object' && !Array.isArray(valueRaw)) {
    parsed = valueRaw as Record<string, unknown>;
  }
  if (!parsed) return null;

  const summaryArr = Array.isArray(parsed.summary)
    ? parsed.summary.filter((s): s is string => typeof s === 'string')
    : [];

  return {
    shifts: {
      discountRateShiftPct: num(parsed.discountRateShiftPct),
      exitCapRateShiftPct: num(parsed.exitCapRateShiftPct),
      debtCostShiftPct: num(parsed.debtCostShiftPct),
      occupancyShiftPct: num(parsed.occupancyShiftPct),
      growthShiftPct: num(parsed.growthShiftPct),
      replacementCostShiftPct: num(parsed.replacementCostShiftPct)
    },
    weightLine: typeof guidanceEntry.freshnessLabel === 'string' ? guidanceEntry.freshnessLabel : '',
    summary: summaryArr
  };
}
