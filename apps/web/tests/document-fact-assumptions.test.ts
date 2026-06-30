import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  normalizeDocumentFactsToAssumptions,
  DEFAULT_MIN_CONFIDENCE,
  MAPPED_FACT_KEYS,
  type DocumentFactLike
} from '@/lib/services/valuation/document-fact-assumptions';

const fact = (
  p: Partial<DocumentFactLike> & Pick<DocumentFactLike, 'factKey'>
): DocumentFactLike => ({
  factValueNumber: null,
  factValueText: null,
  unit: null,
  confidenceScore: 0.9,
  ...p
});

test('maps high-confidence numeric facts into documentFeatures.* with provenance', () => {
  const r = normalizeDocumentFactsToAssumptions([
    fact({ id: 'f1', factKey: 'occupancy_pct', factValueNumber: 0.75, confidenceScore: 0.82 }),
    fact({
      id: 'f2',
      factKey: 'cap_rate_pct',
      factValueNumber: 6.0,
      unit: '%',
      confidenceScore: 0.71
    })
  ]);
  assert.deepEqual(r.partial, {
    documentFeatures: { occupancyPct: 0.75, capRatePct: 6.0 }
  });
  assert.equal(r.provenance.length, 2);
  const cap = r.provenance.find((p) => p.assumptionPath === 'documentFeatures.capRatePct')!;
  assert.equal(cap.sourceFactKey, 'cap_rate_pct');
  assert.equal(cap.sourceFactId, 'f2');
  assert.equal(cap.value, 6.0);
  assert.equal(cap.unit, '%');
  assert.equal(cap.extractionConfidence, 0.71);
  assert.equal(r.skipped.length, 0);
});

test('gates out facts below the confidence floor (and missing confidence)', () => {
  const r = normalizeDocumentFactsToAssumptions([
    fact({ factKey: 'capex_krw', factValueNumber: 500_000_000, confidenceScore: 0.4 }),
    fact({ factKey: 'occupancy_pct', factValueNumber: 0.8, confidenceScore: null })
  ]);
  assert.deepEqual(r.partial, {});
  assert.equal(r.provenance.length, 0);
  assert.equal(r.skipped.length, 2);
  assert.ok(r.skipped.every((s) => s.reason === 'low_confidence'));
});

test('minConfidenceScore override lets a lower-confidence fact through', () => {
  const r = normalizeDocumentFactsToAssumptions(
    [fact({ factKey: 'capex_krw', factValueNumber: 500_000_000, confidenceScore: 0.4 })],
    { minConfidenceScore: 0 }
  );
  assert.equal((r.partial.documentFeatures as Record<string, unknown>).capexKrw, 500_000_000);
  assert.equal(r.skipped.length, 0);
});

test('unknown fact keys are skipped as no_mapping', () => {
  const r = normalizeDocumentFactsToAssumptions([
    fact({ factKey: 'tenant_status', factValueText: 'occupied', confidenceScore: 0.95 }),
    fact({ factKey: 'totally_unknown', factValueNumber: 1, confidenceScore: 0.95 })
  ]);
  assert.deepEqual(r.partial, {});
  assert.equal(r.skipped.length, 2);
  assert.ok(r.skipped.every((s) => s.reason === 'no_mapping'));
});

test('numeric mapping requires a finite number; text mapping requires non-empty text', () => {
  const r = normalizeDocumentFactsToAssumptions([
    fact({
      factKey: 'cap_rate_pct',
      factValueNumber: null,
      factValueText: '6%',
      confidenceScore: 0.9
    }),
    fact({ factKey: 'permit_status_note', factValueText: '   ', confidenceScore: 0.9 })
  ]);
  assert.deepEqual(r.partial, {});
  assert.equal(r.skipped.filter((s) => s.reason === 'missing_value').length, 2);
});

test('text fact maps and trims into documentFeatures.permitStatusNote', () => {
  const r = normalizeDocumentFactsToAssumptions([
    fact({
      factKey: 'permit_status_note',
      factValueText: '  전력 인입 승인 완료  ',
      confidenceScore: 0.8
    })
  ]);
  assert.equal((r.partial.documentFeatures as Record<string, unknown>).permitStatusNote, '전력 인입 승인 완료');
});

test('budget_krw and capex_krw share the capexKrw target; higher confidence wins', () => {
  const r = normalizeDocumentFactsToAssumptions([
    fact({ id: 'low', factKey: 'capex_krw', factValueNumber: 100, confidenceScore: 0.7 }),
    fact({ id: 'high', factKey: 'budget_krw', factValueNumber: 200, confidenceScore: 0.9 })
  ]);
  assert.equal((r.partial.documentFeatures as Record<string, unknown>).capexKrw, 200); // higher-confidence wins
  assert.equal(r.provenance.length, 1);
  assert.equal(r.provenance[0]!.sourceFactId, 'high');
  const dup = r.skipped.find((s) => s.reason === 'duplicate_lower_confidence');
  assert.ok(dup && dup.factKey === 'capex_krw');
});

test('exposes the mapped fact keys and a sane default floor', () => {
  assert.ok(MAPPED_FACT_KEYS.includes('occupancy_pct'));
  assert.ok(!MAPPED_FACT_KEYS.includes('tenant_status'));
  assert.equal(DEFAULT_MIN_CONFIDENCE, 0.65);
});
