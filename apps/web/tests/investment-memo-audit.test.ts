/**
 * Deterministic assumption-audit + IRR-reconciliation tests for the offline
 * investment memo. The audit/reconciliation block must be:
 *   - present and identical regardless of LLM availability (we run with no key),
 *   - exhaustive over the provenance fields (no key input silently dropped),
 *   - a real consistency check (flags base-vs-MC-base divergence beyond tol).
 *
 * Offline: ANTHROPIC_API_KEY is unset in the test env so generateInvestmentMemo
 * takes the deterministic template path.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { generateInvestmentMemo } from '@/lib/services/property-analyzer/investment-memo';
import type { InvestmentMemoInputs } from '@/lib/services/property-analyzer/investment-memo';
import type { AnalysisProvenance } from '@/lib/services/property-analyzer/bundle-assembler';
import type { ReturnMetrics } from '@/lib/services/valuation/return-metrics';
import type { MonteCarloResult } from '@/lib/services/valuation/monte-carlo';
import type { InvestmentVerdict } from '@/lib/services/valuation/investment-verdict';
import type { ImpliedBidSet } from '@/lib/services/valuation/implied-bid';
import type { RefinanceAnalysis } from '@/lib/services/valuation/refinancing';
import type { DealMacroExposure } from '@/lib/services/macro/deal-risk';

function fakeReturnMetrics(equityIrr: number | null): ReturnMetrics {
  return {
    equityIrr,
    leveragedIrr: equityIrr,
    unleveragedIrr: equityIrr === null ? null : equityIrr - 3,
    equityMultiple: 1.8,
    cashOnCashByYear: [3, 4, 5],
    averageCashOnCash: 4,
    peakEquityExposureKrw: 20_000_000_000,
    paybackYear: 7
  };
}

function fakeMonteCarlo(base: number | null, mean: number, p50: number): MonteCarloResult {
  const dist = {
    p10: mean - 4,
    p25: mean - 2,
    p50,
    p75: mean + 2,
    p90: mean + 4,
    mean,
    stdDev: 3,
    min: mean - 8,
    max: mean + 8,
    histogram: [],
    tail: {
      p5: null,
      p1: null,
      expectedShortfall95: null,
      expectedShortfall99: null,
      p95: null,
      p99: null,
      downsideDeviation: null,
      downsideTarget: 0,
      worstObserved: null,
      sampleCount: 0
    }
  };
  return {
    iterations: 1000,
    seed: 42,
    validIterations: 1000,
    leveredIrr: dist,
    unleveredIrr: dist,
    moic: { ...dist, p50: 1.8 },
    probLeveredIrrBelow: [
      { targetPct: 8, probability: 0.2 },
      { targetPct: 10, probability: 0.35 }
    ],
    drivers: [],
    baseLeveredIrr: base,
    baseUnleveredIrr: base === null ? null : base - 3,
    baseMoic: 1.8,
    correlationMatrix: [],
    driverOrder: [],
    realizedCorrelation: []
  };
}

function fakeVerdict(): InvestmentVerdict {
  return {
    tier: 'BUY',
    headline: 'Attractive base case.',
    totalScore: 5,
    maxPossibleScore: 10,
    normalizedScore: 0.5,
    dimensions: [],
    positives: [],
    negatives: [],
    redFlags: [],
    conditions: [],
    hurdlesUsed: {
      targetLeveredIrrPct: 12,
      floorP10IrrPct: 8,
      maxProbBelow8Pct: 0.25,
      minMoicP50: 1.5,
      maxMacroScore: 60,
      dscrCovenant: 1.15
    }
  } as unknown as InvestmentVerdict;
}

function fakeImpliedBid(baseIrr: number | null): ImpliedBidSet {
  const sol = {
    target: 'base_irr' as const,
    targetIrrPct: 12,
    bidPriceKrw: 48_000_000_000,
    basePriceKrw: 50_000_000_000,
    discountPct: 4,
    achievedIrrPct: 12,
    iterations: 20,
    converged: true
  };
  return {
    basePriceKrw: 50_000_000_000,
    baseBaseIrrPct: baseIrr,
    targetIrrPct: 12,
    floorIrrPct: 8,
    atTargetIrr: sol,
    atP50TargetIrr: { ...sol, target: 'mc_p50_irr' },
    atP10FloorIrr: { ...sol, target: 'mc_p10_irr' },
    breakEven: { ...sol, target: 'break_even', targetIrrPct: null }
  };
}

function fakeRefinancing(): RefinanceAnalysis {
  return { triggers: [] } as unknown as RefinanceAnalysis;
}

function fakeExposure(): DealMacroExposure {
  return {
    overallScore: 40,
    band: 'MODERATE',
    summary: '중립 매크로'
  } as unknown as DealMacroExposure;
}

function fakeProvenance(): AnalysisProvenance {
  return {
    fields: [
      // Deliberately out of preferred order to prove the audit reorders.
      {
        field: 'occupancy',
        label: '점유율',
        value: '90%',
        tier: 'IMPUTED',
        source: 'rent-comps',
        note: ''
      },
      {
        field: 'capRate',
        label: '캡레이트',
        value: '6.0%',
        tier: 'LIVE',
        source: 'rtms (live)',
        note: ''
      },
      {
        field: 'geocode',
        label: '지오코드',
        value: '서울',
        tier: 'MOCK',
        source: 'synthetic',
        note: ''
      },
      {
        field: 'somethingExtra',
        label: '기타',
        value: 'x',
        tier: 'FALLBACK',
        source: 'constant',
        note: ''
      }
    ],
    connectorFailures: [],
    estimatedCount: 3,
    totalCount: 4,
    trustHint: '3 of 4 key inputs are estimated.',
    confidence: 'medium'
  };
}

function makeInputs(overrides: Partial<InvestmentMemoInputs> = {}): InvestmentMemoInputs {
  return {
    assetClass: 'OFFICE',
    market: 'Seoul',
    districtName: '강남구',
    address: '서울특별시 강남구 압구정로 340',
    basePriceKrw: 50_000_000_000,
    verdict: fakeVerdict(),
    returnMetrics: fakeReturnMetrics(12.5),
    monteCarlo: fakeMonteCarlo(12.2, 11.8, 11.5),
    impliedBid: fakeImpliedBid(12.4),
    refinancing: fakeRefinancing(),
    dealExposure: fakeExposure(),
    macroRegimeLabel: '중립',
    debtCovenantBreachYears: [],
    assumptionsQuality: fakeProvenance(),
    monteCarloBaseLeveredIrrPct: 12.2,
    ...overrides
  };
}

test('memo audit: lists every provenance field with its tier, key fields first, exhaustive', async () => {
  const memo = await generateInvestmentMemo(makeInputs());
  assert.equal(memo.generatedBy, 'offline-template', 'must use the offline path with no API key');

  const audit = memo.assumptionAudit;
  // Exhaustive: every provenance field is represented (none dropped).
  assert.equal(audit.length, 4);
  // Key field capRate ordered ahead of the non-key extras.
  const fields = audit.map((r) => r.field);
  assert.ok(fields.indexOf('capRate') < fields.indexOf('somethingExtra'));
  // Tiers preserved verbatim so a reviewer sees LIVE vs MOCK at a glance.
  const cap = audit.find((r) => r.field === 'capRate')!;
  assert.equal(cap.tier, 'LIVE');
  const geo = audit.find((r) => r.field === 'geocode')!;
  assert.equal(geo.tier, 'MOCK');
});

test('memo audit: empty when no provenance supplied (backward compatible)', async () => {
  const memo = await generateInvestmentMemo(makeInputs({ assumptionsQuality: undefined }));
  assert.deepEqual(memo.assumptionAudit, []);
  // Reconciliation is still produced from the numeric inputs.
  assert.equal(memo.reconciliation.baseLeveredIrrPct, 12.5);
});

test('memo reconciliation: surfaces base vs MC mean/p50/base and does NOT flag within tolerance', async () => {
  const memo = await generateInvestmentMemo(makeInputs());
  const r = memo.reconciliation;
  assert.equal(r.baseLeveredIrrPct, 12.5);
  assert.equal(r.monteCarloMeanIrrPct, 11.8);
  assert.equal(r.monteCarloP50IrrPct, 11.5);
  assert.equal(r.monteCarloBaseIrrPct, 12.2);
  assert.equal(r.impliedBidBaseIrrPct, 12.4);
  // |12.5 - 12.2| = 0.3pp < 1.5pp tolerance → not flagged.
  assert.equal(r.baseVsMcBaseDivergencePp, 0.3);
  assert.equal(r.flagged, false);
});

test('memo reconciliation: FLAGS divergence when deterministic base and MC base disagree', async () => {
  // Force a 4pp gap between headline (15) and MC base (10) → must flag.
  const memo = await generateInvestmentMemo(
    makeInputs({
      returnMetrics: fakeReturnMetrics(15),
      monteCarlo: fakeMonteCarlo(10, 9.5, 9.2),
      monteCarloBaseLeveredIrrPct: 10
    })
  );
  assert.equal(memo.reconciliation.baseVsMcBaseDivergencePp, 5);
  assert.equal(memo.reconciliation.flagged, true);
  // The offline downside narrative must mention the consistency warning.
  assert.ok(
    memo.downsideNarrative.includes('정합성 경고'),
    'flagged divergence must surface in the offline narrative'
  );
});

test('memo reconciliation: handles null IRRs gracefully (no NaN, not flagged)', async () => {
  const memo = await generateInvestmentMemo(
    makeInputs({
      returnMetrics: fakeReturnMetrics(null),
      monteCarlo: fakeMonteCarlo(null, 9, 9),
      monteCarloBaseLeveredIrrPct: null
    })
  );
  assert.equal(memo.reconciliation.baseLeveredIrrPct, null);
  assert.equal(memo.reconciliation.monteCarloBaseIrrPct, null);
  assert.equal(memo.reconciliation.baseVsMcBaseDivergencePp, null);
  assert.equal(memo.reconciliation.flagged, false);
});
