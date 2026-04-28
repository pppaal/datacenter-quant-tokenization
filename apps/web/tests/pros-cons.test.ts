import assert from 'node:assert/strict';
import test from 'node:test';
import { buildProsConsReport } from '@/lib/services/valuation/pros-cons';
import type { InvestmentVerdict } from '@/lib/services/valuation/investment-verdict';
import type { DealMacroExposure } from '@/lib/services/macro/deal-risk';
import type { RentDefaultProjection } from '@/lib/services/valuation/tenant-credit';
import type { DebtSourcingResult } from '@/lib/services/valuation/debt-sourcing';
import type { RefinanceAnalysis } from '@/lib/services/valuation/refinancing';

// Minimal stubs — only the fields that pros-cons reads.
function makeVerdict(overrides: Partial<InvestmentVerdict> = {}): InvestmentVerdict {
  return {
    tier: 'BUY',
    headline: 'good',
    totalScore: 12,
    maxPossibleScore: 29,
    normalizedScore: 0.41,
    dimensions: [
      {
        dimension: 'Base Levered IRR',
        observed: '13.5%',
        threshold: 't',
        score: 2.5,
        weight: 3,
        contribution: 7.5,
        maxScore: 3,
        minScore: -3
      },
      {
        dimension: 'P50 MOIC',
        observed: '2.1x',
        threshold: 't',
        score: 1.8,
        weight: 1,
        contribution: 1.8,
        maxScore: 2,
        minScore: -2
      },
      {
        dimension: 'DSCR Covenant',
        observed: '2y < 1.15x',
        threshold: 't',
        score: -0.5,
        weight: 3,
        contribution: -1.5,
        maxScore: 1,
        minScore: -3
      }
    ],
    positives: [],
    negatives: [],
    redFlags: [],
    conditions: [],
    hurdlesUsed: {
      targetLeveredIrrPct: 12,
      floorP10IrrPct: 6,
      maxProbBelow8Pct: 0.25,
      minMoicP50: 1.5,
      maxMacroScore: 70,
      dscrCovenant: 1.15
    },
    ...overrides
  };
}

function makeMacro(): DealMacroExposure {
  return {
    dealId: 'd1',
    market: 'Seoul',
    assetClass: 'OFFICE',
    overallScore: 35,
    rawScore: 35,
    band: 'LOW',
    dimensions: [],
    correlationPenalty: { penaltyPct: 0, drivers: [] } as any,
    summary: 'low macro exposure',
    riskFactors: ['Rate volatility this quarter'],
    mitigants: ['Investment-grade tenant', 'Long WALT']
  };
}

function makeDebtSourcing(eligibleCount: number): DebtSourcingResult {
  return {
    shortlist: [],
    eligibleCount,
    recommendedTopN:
      eligibleCount > 0
        ? [
            {
              lender: { name: 'L1' } as any,
              fitScore: 80,
              eligible: true,
              checks: {} as any,
              indicativeSpreadBps: 180,
              indicativeAllInRatePct: 5.4,
              indicativeAmortizationStyle: 'FULL_AMORT',
              indicativeTermYears: 5,
              reasons: []
            }
          ]
        : [],
    fallbackRationale: null
  };
}

function makeRefi(): RefinanceAnalysis {
  return { triggers: [], scenarios: [], recommendation: '' };
}

test('buildProsConsReport — strong deal yields net POSITIVE', () => {
  const r = buildProsConsReport({
    verdict: makeVerdict(),
    macroExposure: makeMacro(),
    tenantCredit: null,
    debtSourcing: makeDebtSourcing(6),
    refinancing: makeRefi()
  });

  assert.equal(r.summary.netSentiment, 'POSITIVE');
  assert.ok(r.pros.length > 0);
  assert.ok(r.pros.some((p) => p.category === 'returns'));
  assert.ok(r.pros.some((p) => p.category === 'debt'));
});

test('buildProsConsReport — material cons drag to NEGATIVE', () => {
  const tc: RentDefaultProjection = {
    totalAnnualRentKrw: 1_000_000_000,
    weightedPd1yrPct: 12,
    weightedGrade: 'B',
    expectedAnnualRentLossKrw: 90_000_000,
    adjustedAnnualRentKrw: 910_000_000,
    effectiveCreditReservePct: 9,
    breakdown: [
      {
        companyName: 'WeakCo',
        grade: 'B',
        annualRentKrw: 800_000_000,
        pd1yrPct: 12,
        expectedAnnualLossKrw: 90_000_000
      },
      {
        companyName: 'X',
        grade: 'BB',
        annualRentKrw: 200_000_000,
        pd1yrPct: 4,
        expectedAnnualLossKrw: 0
      }
    ]
  };
  const verdict = makeVerdict({
    dimensions: [
      {
        dimension: 'Base Levered IRR',
        observed: '5%',
        threshold: 't',
        score: -2.5,
        weight: 3,
        contribution: -7.5,
        maxScore: 3,
        minScore: -3
      },
      {
        dimension: 'DSCR Covenant',
        observed: '4y < 1.15x',
        threshold: 't',
        score: -1.5,
        weight: 3,
        contribution: -4.5,
        maxScore: 1,
        minScore: -3
      }
    ]
  });
  const r = buildProsConsReport({
    verdict,
    macroExposure: {
      ...makeMacro(),
      band: 'HIGH',
      riskFactors: ['Rates +200bps stress', 'Vacancy +4pp'],
      mitigants: []
    },
    tenantCredit: tc,
    debtSourcing: makeDebtSourcing(0),
    refinancing: {
      triggers: [{ year: 3, reason: 'DSCR breach', severity: 'CRITICAL' }],
      scenarios: [],
      recommendation: ''
    }
  });

  assert.equal(r.summary.netSentiment, 'NEGATIVE');
  assert.ok(
    r.summary.materialCons >= 2,
    `expected ≥2 material cons, got ${r.summary.materialCons}`
  );
  assert.ok(r.cons.some((c) => c.category === 'tenant'));
  assert.ok(r.cons.some((c) => c.category === 'debt'));
});

test('cons sorted by severity desc', () => {
  const r = buildProsConsReport({
    verdict: makeVerdict({
      dimensions: [
        {
          dimension: 'Base Levered IRR',
          observed: '5%',
          threshold: 't',
          score: -2.5,
          weight: 3,
          contribution: -7.5,
          maxScore: 3,
          minScore: -3
        },
        {
          dimension: 'P50 MOIC',
          observed: '1.4x',
          threshold: 't',
          score: -0.6,
          weight: 1,
          contribution: -0.6,
          maxScore: 2,
          minScore: -2
        }
      ]
    }),
    macroExposure: makeMacro(),
    tenantCredit: null,
    debtSourcing: makeDebtSourcing(3),
    refinancing: makeRefi()
  });
  for (let i = 1; i < r.cons.length; i++) {
    assert.ok(r.cons[i - 1]!.severity >= r.cons[i]!.severity, 'cons not sorted by severity desc');
  }
});
