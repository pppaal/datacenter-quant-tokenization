/**
 * Map persisted ValuationRun.provenance entries to the IM cards that
 * reference each field, so the cards can render an inline "source"
 * pill instead of the LP scrolling to the matrix at the bottom.
 *
 * The mapping is intentionally lossy — many provenance fields don't
 * surface on a card (geo, satellite, internal feature snapshots).
 * We surface only the ones the LP would naturally challenge.
 */
type ProvenanceEntry = {
  field: string;
  sourceSystem: string;
  value: unknown;
  mode: string;
  freshnessLabel: string;
};

export type CardProvenance = {
  field: string;
  sourceSystem: string;
  mode: string;
  freshnessLabel: string;
};

const CARD_FIELDS: Record<string, RegExp[]> = {
  macro: [/^macro\./i],
  // Returns / valuation rates
  valuationRates: [
    /^capRatePct$/i,
    /^macro\.cap_rate_pct$/i,
    /^macro\.discount_rate_pct$/i,
    /^macro\.policy_rate_pct$/i
  ],
  // Capital structure (debt)
  capitalStructure: [
    /^debtFacilities$/i,
    /^macro\.debt_cost_pct$/i,
    /^macro\.credit_spread_bps$/i
  ],
  // Tenancy
  tenancy: [/^leaseCount$/i, /^macro\.rent_growth_pct$/i, /^macro\.vacancy_pct$/i],
  // Sources & Uses
  capex: [/^capexBreakdown$/i, /^macro\.construction_cost_index$/i],
  // Macro engine guidance
  scenarioEngine: [/^macro\.guidance$/i],
  // Tenant credit
  tenantCredit: [/^credit\./i],
  // Site / satellite / hazard
  siteRisk: [/Risk(Score)?$/i, /^satelliteFeatureSnapshot$/i, /^permitFeatureSnapshot$/i]
};

function asEntries(provenance: unknown): ProvenanceEntry[] {
  if (!Array.isArray(provenance)) return [];
  return provenance.filter(
    (e): e is ProvenanceEntry =>
      !!e &&
      typeof e === 'object' &&
      typeof (e as ProvenanceEntry).field === 'string' &&
      typeof (e as ProvenanceEntry).sourceSystem === 'string'
  );
}

export function pickProvenanceForCard(
  provenance: unknown,
  card: keyof typeof CARD_FIELDS
): CardProvenance[] {
  const entries = asEntries(provenance);
  const patterns = CARD_FIELDS[card];
  return entries
    .filter((entry) => patterns.some((pattern) => pattern.test(entry.field)))
    .map((entry) => ({
      field: entry.field,
      sourceSystem: entry.sourceSystem,
      mode: entry.mode,
      freshnessLabel: entry.freshnessLabel
    }));
}

/** Compact "src · src · src" string for inline rendering under a card. */
export function summarizeProvenance(entries: CardProvenance[]): string {
  if (entries.length === 0) return '';
  const distinct = Array.from(new Set(entries.map((e) => e.sourceSystem)));
  return distinct.join(' · ');
}
