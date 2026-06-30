/**
 * Document facts → underwriting assumption overrides (benchmark #5).
 *
 * Extraction already exists (`ingestDocumentExtraction` → `DocumentFact` rows) and those
 * facts are promoted to `AssetFeatureSnapshot` for DISPLAY. What was missing is the loop
 * back into the VALUATION: turning high-confidence extracted facts into the
 * `documentFeatures.*` assumption-override bucket the strategies already consume, with a
 * confidence gate, an audit trail, and explicit skip reasons.
 *
 * This is PURE and DB-free (operates on already-fetched fact rows) so it is fully
 * unit-testable. It maps the SAME fact-key → override-path pairs that
 * `feature-assumption-mapping.ts` uses for `document.*` features, so the two stay
 * consistent. Numeric values are passed through UNCHANGED (no unit/scale guessing — the
 * `unit` is carried in provenance and the valuation layer interprets it as it already
 * does); only mapping + gating + dedup happen here.
 */

export type DocumentFactLike = {
  id?: string | null;
  factKey: string;
  factValueNumber?: number | null;
  factValueText?: string | null;
  unit?: string | null;
  confidenceScore?: number | null;
};

type FactMapping = { path: string; kind: 'number' | 'text' };

/**
 * Fact-key → `documentFeatures.*` override path. Mirrors the `document.*` override targets
 * in `feature-assumption-mapping.ts` (budget_krw shares capexKrw, as there). Notes
 * (counterparty/tenant status) are intentionally NOT mapped to assumptions — they inform
 * display/diligence, not the numeric model.
 */
const FACT_ASSUMPTION_MAP: Record<string, FactMapping> = {
  occupancy_pct: { path: 'documentFeatures.occupancyPct', kind: 'number' },
  monthly_rate_per_kw_krw: { path: 'documentFeatures.monthlyRatePerKwKrw', kind: 'number' },
  cap_rate_pct: { path: 'documentFeatures.capRatePct', kind: 'number' },
  discount_rate_pct: { path: 'documentFeatures.discountRatePct', kind: 'number' },
  capex_krw: { path: 'documentFeatures.capexKrw', kind: 'number' },
  budget_krw: { path: 'documentFeatures.capexKrw', kind: 'number' },
  contracted_kw: { path: 'documentFeatures.contractedKw', kind: 'number' },
  permit_status_note: { path: 'documentFeatures.permitStatusNote', kind: 'text' }
};

export type AssumptionProvenanceEntry = {
  assumptionPath: string;
  sourceFactKey: string;
  sourceFactId: string | null;
  value: number | string;
  unit: string | null;
  extractionConfidence: number;
};

export type SkipReason =
  | 'no_mapping'
  | 'low_confidence'
  | 'missing_value'
  | 'duplicate_lower_confidence';

export type SkippedFact = {
  factKey: string;
  assumptionPath: string | null;
  reason: SkipReason;
};

export type NormalizedDocumentAssumptions = {
  /** Nested partial assumptions, e.g. `{ documentFeatures: { occupancyPct: 0.75 } }`. */
  partial: Record<string, unknown>;
  provenance: AssumptionProvenanceEntry[];
  skipped: SkippedFact[];
};

export const DEFAULT_MIN_CONFIDENCE = 0.65;

function setPath(root: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let cursor = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]!;
    if (typeof cursor[key] !== 'object' || cursor[key] === null) cursor[key] = {};
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[parts[parts.length - 1]!] = value;
}

/**
 * Normalize extracted document facts into a `documentFeatures.*` assumption delta.
 *
 * Gating: facts below `minConfidenceScore` (default 0.65) are skipped — a missing
 * confidence is treated as failing the gate, because un-scored extractions should not
 * silently steer a valuation. When two facts target the same path, the higher-confidence
 * one wins and the other is recorded as `duplicate_lower_confidence`.
 */
export function normalizeDocumentFactsToAssumptions(
  facts: DocumentFactLike[],
  options?: { minConfidenceScore?: number }
): NormalizedDocumentAssumptions {
  const floor = options?.minConfidenceScore ?? DEFAULT_MIN_CONFIDENCE;
  const partial: Record<string, unknown> = {};
  const skipped: SkippedFact[] = [];
  // Best provenance entry per target path (highest confidence wins).
  const bestByPath = new Map<string, AssumptionProvenanceEntry>();

  for (const fact of facts) {
    const mapping = FACT_ASSUMPTION_MAP[fact.factKey];
    if (!mapping) {
      skipped.push({ factKey: fact.factKey, assumptionPath: null, reason: 'no_mapping' });
      continue;
    }
    const confidence = typeof fact.confidenceScore === 'number' ? fact.confidenceScore : null;
    if (confidence == null || confidence < floor) {
      skipped.push({
        factKey: fact.factKey,
        assumptionPath: mapping.path,
        reason: 'low_confidence'
      });
      continue;
    }
    const value: number | string | null =
      mapping.kind === 'number'
        ? typeof fact.factValueNumber === 'number' && Number.isFinite(fact.factValueNumber)
          ? fact.factValueNumber
          : null
        : typeof fact.factValueText === 'string' && fact.factValueText.trim().length > 0
          ? fact.factValueText.trim()
          : null;
    if (value == null) {
      skipped.push({
        factKey: fact.factKey,
        assumptionPath: mapping.path,
        reason: 'missing_value'
      });
      continue;
    }

    const entry: AssumptionProvenanceEntry = {
      assumptionPath: mapping.path,
      sourceFactKey: fact.factKey,
      sourceFactId: fact.id ?? null,
      value,
      unit: fact.unit ?? null,
      extractionConfidence: confidence
    };
    const existing = bestByPath.get(mapping.path);
    if (!existing) {
      bestByPath.set(mapping.path, entry);
    } else if (confidence > existing.extractionConfidence) {
      skipped.push({
        factKey: existing.sourceFactKey,
        assumptionPath: mapping.path,
        reason: 'duplicate_lower_confidence'
      });
      bestByPath.set(mapping.path, entry);
    } else {
      skipped.push({
        factKey: fact.factKey,
        assumptionPath: mapping.path,
        reason: 'duplicate_lower_confidence'
      });
    }
  }

  const provenance = [...bestByPath.values()];
  for (const entry of provenance) setPath(partial, entry.assumptionPath, entry.value);

  return { partial, provenance, skipped };
}

/** The fact keys this normalizer understands (for callers/tests). */
export const MAPPED_FACT_KEYS = Object.freeze(Object.keys(FACT_ASSUMPTION_MAP));
