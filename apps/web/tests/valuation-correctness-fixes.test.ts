import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AssetClass,
  AssetStage,
  AssetStatus,
  type RentComp,
  RelationshipCoverageStatus,
  SourceStatus
} from '@prisma/client';
import { applyCreditOverlay } from '@/lib/services/valuation/credit-overlay';
import {
  buildStabilizedIncomeValuation,
  clampConfidence,
  type ConfidenceBounds
} from '@/lib/services/valuation/stabilized-income';
import {
  buildMultifamilyValuationConfig,
  buildOfficeValuationConfig
} from '@/lib/services/valuation/stabilized-income-configs';
import type {
  BundleCreditAssessment,
  UnderwritingAnalysis,
  UnderwritingBundle
} from '@/lib/services/valuation/types';

const now = new Date();

// ---------------------------------------------------------------------------
// Fake bundle construction. Kept offline: market-evidence reads only from the
// bundle's rentComps/transactionComps arrays, and macro reads from macroSeries
// (left empty so macroGuidance shifts are 0 and the engine's adjustedOccupancy /
// capRate equal the raw inputs). This lets us hand-compute expected numbers.
// ---------------------------------------------------------------------------
type AssetOverrides = Partial<UnderwritingBundle['asset']>;

function buildAsset(
  assetClass: AssetClass,
  overrides: AssetOverrides = {}
): UnderwritingBundle['asset'] {
  return {
    id: 'fix_asset_1',
    assetCode: 'KR-FIX-01',
    slug: 'kr-fix-01',
    name: 'Fixture Asset',
    assetClass,
    assetType: String(assetClass),
    assetSubtype: 'Core',
    market: 'KR',
    status: AssetStatus.UNDER_REVIEW,
    stage: AssetStage.STABILIZED,
    description: 'Valuation correctness fixture.',
    ownerName: null,
    sponsorName: null,
    developmentSummary: null,
    targetItLoadMw: null,
    powerCapacityMw: null,
    landAreaSqm: 4000,
    grossFloorAreaSqm: 12000,
    rentableAreaSqm: 10000,
    purchasePriceKrw: 200000000000,
    occupancyAssumptionPct: 90,
    stabilizedOccupancyPct: 90,
    tenantAssumption: 'Diversified tenants',
    capexAssumptionKrw: null,
    opexAssumptionKrw: null,
    financingLtvPct: 55,
    financingRatePct: 4.5,
    holdingPeriodYears: 5,
    exitCapRatePct: 5,
    currentValuationKrw: null,
    lastEnrichedAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides
  } as UnderwritingBundle['asset'];
}

function buildBundle(
  assetClass: AssetClass,
  options: {
    assetOverrides?: AssetOverrides;
    rentComps?: RentComp[];
    creditAssessments?: BundleCreditAssessment[];
    officeDetail?: UnderwritingBundle['officeDetail'];
  } = {}
): UnderwritingBundle {
  return {
    asset: buildAsset(assetClass, options.assetOverrides),
    address: null,
    siteProfile: null,
    buildingSnapshot: null,
    permitSnapshot: null,
    energySnapshot: null,
    // No marketSnapshot -> no macro vacancy fallback; macroSeries empty -> zero shifts.
    marketSnapshot: null,
    macroSeries: [],
    transactionComps: [],
    rentComps: options.rentComps ?? [],
    marketIndicatorSeries: [],
    officeDetail: options.officeDetail ?? null,
    comparableSet: null,
    creditAssessments: options.creditAssessments ?? []
  };
}

function rentComp(monthlyRentPerSqmKrw: number): RentComp {
  return {
    id: `rent_${monthlyRentPerSqmKrw}`,
    assetId: 'fix_asset_1',
    market: 'KR',
    region: 'Seoul',
    comparableType: 'LEASE',
    observationDate: now,
    monthlyRentPerSqmKrw,
    monthlyRatePerKwKrw: null,
    occupancyPct: null,
    escalationPct: null,
    sourceLink: null,
    sourceSystem: 'manual',
    sourceStatus: SourceStatus.MANUAL,
    createdAt: now,
    updatedAt: now
  };
}

// ===========================================================================
// FIX 1 — Double occupancy/vacancy haircut REMOVED.
// effectiveRentalRevenueKrw = GPR * max(occFloor, occupancy/100)
//                                 * max(creditFloor, 1 - creditLoss/100)
// (the old (1 - (vacancy+creditLoss)/100) double-haircut term is gone).
// ===========================================================================

test('FIX 1 (office): effective rental revenue applies occupancy haircut exactly once', () => {
  // Drive a known occupancy via stabilizedOccupancyPct (= adjustedOccupancy
  // because macro shifts are zero). 90% sits between office floor 55 and
  // ceiling 100 so it survives the clamp unchanged.
  const valuation = buildStabilizedIncomeValuation(
    buildBundle(AssetClass.OFFICE, {
      assetOverrides: { stabilizedOccupancyPct: 90 }
    }),
    {},
    buildOfficeValuationConfig()
  );

  assert.equal(valuation.adjustedOccupancyPct, 90, 'occupancy should survive the clamp');
  // Office creditLossPct fallback is 1.5 (no officeDetail.creditLossPct).
  assert.equal(valuation.creditLossPct, 1.5);

  const occupancyFactor = Math.max(0.45, valuation.adjustedOccupancyPct / 100); // 0.90
  const creditFactor = Math.max(0.7, 1 - valuation.creditLossPct / 100); // 0.985
  const expectedSingle = valuation.grossPotentialRentKrw * occupancyFactor * creditFactor;

  // The OLD double-haircut number would have additionally multiplied by
  // (1 - (vacancyAllowance + creditLoss)/100). For 90% occupancy the office
  // vacancyAllowance fallback is max(100-90, 4) = 10, so the old factor was
  // (1 - (10 + 1.5)/100) = 0.885 -> a materially LOWER revenue. Pin that the
  // corrected value is the single-application number, NOT the old one.
  const oldDoubleHaircut =
    valuation.grossPotentialRentKrw *
    occupancyFactor *
    (1 - (valuation.vacancyAllowancePct + valuation.creditLossPct) / 100);

  assert.equal(
    valuation.effectiveRentalRevenueKrw,
    expectedSingle,
    'effective revenue must equal the single-application formula'
  );
  assert.ok(
    valuation.effectiveRentalRevenueKrw > oldDoubleHaircut,
    `corrected revenue (${valuation.effectiveRentalRevenueKrw}) must exceed the old double-haircut (${oldDoubleHaircut})`
  );
  // The vacancyAllowance is retained for assumptions surfacing only; confirm it
  // is non-trivial (10%) yet does NOT feed the revenue line.
  assert.equal(valuation.vacancyAllowancePct, 10);
});

test('FIX 1 (multifamily): effective rental revenue applies occupancy haircut exactly once', () => {
  const valuation = buildStabilizedIncomeValuation(
    buildBundle(AssetClass.MULTIFAMILY, {
      assetOverrides: { stabilizedOccupancyPct: 90 }
    }),
    {},
    buildMultifamilyValuationConfig()
  );

  assert.equal(valuation.adjustedOccupancyPct, 90);
  // Multifamily creditLossPct is a flat 0.8.
  assert.equal(valuation.creditLossPct, 0.8);

  const occupancyFactor = Math.max(0.75, valuation.adjustedOccupancyPct / 100); // 0.90
  const creditFactor = Math.max(0.84, 1 - valuation.creditLossPct / 100); // 0.992
  const expectedSingle = valuation.grossPotentialRentKrw * occupancyFactor * creditFactor;

  const oldDoubleHaircut =
    valuation.grossPotentialRentKrw *
    occupancyFactor *
    (1 - (valuation.vacancyAllowancePct + valuation.creditLossPct) / 100);

  assert.equal(valuation.effectiveRentalRevenueKrw, expectedSingle);
  assert.ok(valuation.effectiveRentalRevenueKrw > oldDoubleHaircut);
});

// ===========================================================================
// FIX 3 — Confidence cannot exceed the STRATEGY ceiling after credit overlay.
// ===========================================================================

const OFFICE_CONFIDENCE_FLOOR = 4.8;
const OFFICE_CONFIDENCE_CEILING = 9.2;

function strongCreditAssessment(): BundleCreditAssessment {
  return {
    id: 'credit_strong',
    assetId: 'fix_asset_1',
    counterpartyId: 'cp_strong',
    financialStatementId: null,
    documentVersionId: null,
    assessmentType: 'SPONSOR_CREDIT',
    score: 95,
    riskLevel: 'LOW',
    summary: 'Investment-grade sponsor.',
    metrics: {
      currentRatio: 2.5,
      currentMaturityCoverage: 3.1,
      operatingCashFlowToDebtRatio: 0.4,
      cashToDebtRatio: 0.5
    },
    createdAt: now,
    updatedAt: now,
    counterparty: {
      id: 'cp_strong',
      assetId: 'fix_asset_1',
      dealId: null,
      name: 'Blue-Chip Sponsor',
      role: 'SPONSOR',
      shortName: null,
      company: null,
      email: null,
      phone: null,
      coverageOwner: null,
      coverageStatus: RelationshipCoverageStatus.PRIMARY,
      lastContactAt: null,
      notes: null,
      createdAt: now,
      updatedAt: now
    },
    financialStatement: null
  };
}

function weakCreditAssessment(): BundleCreditAssessment {
  return {
    id: 'credit_weak',
    assetId: 'fix_asset_1',
    counterpartyId: 'cp_weak',
    financialStatementId: null,
    documentVersionId: null,
    assessmentType: 'SPONSOR_CREDIT',
    score: 38,
    riskLevel: 'HIGH',
    summary: 'Distressed sponsor.',
    metrics: {
      currentRatio: 0.8,
      currentMaturityCoverage: 0.7,
      operatingCashFlowToDebtRatio: 0.03,
      cashToDebtRatio: 0.04
    },
    createdAt: now,
    updatedAt: now,
    counterparty: {
      id: 'cp_weak',
      assetId: 'fix_asset_1',
      dealId: null,
      name: 'Distressed Sponsor',
      role: 'SPONSOR',
      shortName: null,
      company: null,
      email: null,
      phone: null,
      coverageOwner: null,
      coverageStatus: RelationshipCoverageStatus.PASSIVE,
      lastContactAt: null,
      notes: null,
      createdAt: now,
      updatedAt: now
    },
    financialStatement: null
  };
}

function officeAnalysisWithConfidence(confidenceScore: number): UnderwritingAnalysis {
  return {
    asset: {
      name: 'Fixture Asset',
      assetCode: 'KR-FIX-01',
      assetClass: 'OFFICE',
      stage: 'STABILIZED',
      market: 'KR'
    },
    baseCaseValueKrw: 1,
    confidenceScore,
    underwritingMemo: '',
    keyRisks: ['Base leasing risk'],
    ddChecklist: ['Base diligence item'],
    assumptions: {},
    provenance: [],
    scenarios: []
  };
}

test('FIX 3: the engine clamps the office base confidence to the strategy ceiling', () => {
  // The office config declares a 9.2 ceiling; confirm it travels with the
  // valuation so downstream adjustments clamp to the SAME bounds.
  const valuation = buildStabilizedIncomeValuation(
    buildBundle(AssetClass.OFFICE, {
      assetOverrides: { stabilizedOccupancyPct: 92 }
    }),
    {},
    buildOfficeValuationConfig()
  );

  assert.deepEqual(valuation.confidenceBounds, {
    floor: OFFICE_CONFIDENCE_FLOOR,
    ceiling: OFFICE_CONFIDENCE_CEILING
  });
  assert.ok(valuation.confidenceScore <= OFFICE_CONFIDENCE_CEILING);
  assert.ok(valuation.confidenceScore >= OFFICE_CONFIDENCE_FLOOR);
});

test('FIX 3: strong credit cannot push confidence past the strategy ceiling', () => {
  // Base confidence already sits AT the office ceiling. A strongly positive
  // credit delta (95-score, LOW-risk, healthy liquidity x3) must NOT push the
  // finalized score above 9.2 nor up to the old engine-wide 9.9 fallback.
  const analysis = officeAnalysisWithConfidence(OFFICE_CONFIDENCE_CEILING);
  const bounds: ConfidenceBounds = {
    floor: OFFICE_CONFIDENCE_FLOOR,
    ceiling: OFFICE_CONFIDENCE_CEILING
  };

  const finalized = applyCreditOverlay(
    analysis,
    buildBundle(AssetClass.OFFICE, {
      creditAssessments: [
        strongCreditAssessment(),
        { ...strongCreditAssessment(), id: 'credit_strong_2', counterpartyId: 'cp_strong_2' },
        { ...strongCreditAssessment(), id: 'credit_strong_3', counterpartyId: 'cp_strong_3' }
      ]
    }),
    bounds
  );

  assert.ok(
    finalized.confidenceScore <= OFFICE_CONFIDENCE_CEILING,
    `final confidence (${finalized.confidenceScore}) must stay <= strategy ceiling ${OFFICE_CONFIDENCE_CEILING}`
  );
  assert.equal(
    finalized.confidenceScore,
    OFFICE_CONFIDENCE_CEILING,
    'a positive delta against a ceiling-pinned base must clamp exactly to the ceiling'
  );
  assert.ok(
    finalized.confidenceScore < 9.9,
    'final confidence must not reach the old engine-wide 9.9 fallback'
  );
  // The assumptions block must report the clamped adjusted confidence.
  assert.equal(
    (finalized.assumptions as { credit: { adjustedConfidence: number } }).credit.adjustedConfidence,
    finalized.confidenceScore
  );
});

test('FIX 3: weak credit lowers confidence but stays at/above the strategy floor', () => {
  // Start from a deliberately low base so the negative delta can press toward
  // the floor without underflowing below it.
  const baseAnalysis = officeAnalysisWithConfidence(5.0);
  const bounds: ConfidenceBounds = {
    floor: OFFICE_CONFIDENCE_FLOOR,
    ceiling: OFFICE_CONFIDENCE_CEILING
  };

  const finalized = applyCreditOverlay(
    baseAnalysis,
    buildBundle(AssetClass.OFFICE, {
      creditAssessments: [
        weakCreditAssessment(),
        { ...weakCreditAssessment(), id: 'credit_weak_2', counterpartyId: 'cp_weak_2' }
      ]
    }),
    bounds
  );

  assert.ok(
    finalized.confidenceScore < baseAnalysis.confidenceScore,
    'weak credit must lower confidence (directional behavior preserved)'
  );
  assert.ok(
    finalized.confidenceScore >= OFFICE_CONFIDENCE_FLOOR,
    `weak-credit confidence (${finalized.confidenceScore}) must stay >= strategy floor ${OFFICE_CONFIDENCE_FLOOR}`
  );
});

test('FIX 3: applyCreditOverlay respects threaded confidenceBounds over the default', () => {
  // A tight ceiling threaded in must override the engine-wide 9.9 default even
  // when the strongly positive delta would otherwise push higher.
  const analysis: UnderwritingAnalysis = {
    asset: {
      name: 'Fixture Asset',
      assetCode: 'KR-FIX-01',
      assetClass: 'OFFICE',
      stage: 'STABILIZED',
      market: 'KR'
    },
    baseCaseValueKrw: 1,
    confidenceScore: 8.9,
    underwritingMemo: '',
    keyRisks: [],
    ddChecklist: [],
    assumptions: {},
    provenance: [],
    scenarios: []
  };
  const threaded: ConfidenceBounds = { floor: 4.8, ceiling: 9.0 };

  const finalized = applyCreditOverlay(
    analysis,
    buildBundle(AssetClass.OFFICE, {
      creditAssessments: [
        strongCreditAssessment(),
        { ...strongCreditAssessment(), id: 'credit_strong_2', counterpartyId: 'cp_strong_2' },
        { ...strongCreditAssessment(), id: 'credit_strong_3', counterpartyId: 'cp_strong_3' }
      ]
    }),
    threaded
  );

  assert.ok(
    finalized.confidenceScore <= threaded.ceiling,
    `threaded ceiling ${threaded.ceiling} must bind; got ${finalized.confidenceScore}`
  );
  // Sanity: clampConfidence itself enforces the bound (guards the helper export).
  assert.equal(clampConfidence(12, threaded), threaded.ceiling);
  assert.equal(clampConfidence(0, threaded), threaded.floor);
});

// ===========================================================================
// FIX 4 — Multifamily prioritizes rent EVIDENCE.
// monthlyRentPerSqmKrw = max(marketEvidence.averageMonthlyRentPerSqmKrw ?? 0, backsolve)
// ===========================================================================

test('FIX 4: multifamily uses high market-evidence rent over the lower backsolve', () => {
  // No evidence -> falls back to the backsolved rent.
  const noEvidence = buildStabilizedIncomeValuation(
    buildBundle(AssetClass.MULTIFAMILY, {
      assetOverrides: { stabilizedOccupancyPct: 90 }
    }),
    {},
    buildMultifamilyValuationConfig()
  );
  const backsolveRent = noEvidence.monthlyRentPerSqmKrw;
  assert.ok(backsolveRent > 0);

  // Provide a market-evidence rent comfortably ABOVE the backsolve.
  const highEvidenceRent = backsolveRent * 2;
  const withEvidence = buildStabilizedIncomeValuation(
    buildBundle(AssetClass.MULTIFAMILY, {
      assetOverrides: { stabilizedOccupancyPct: 90 },
      rentComps: [rentComp(highEvidenceRent)]
    }),
    {},
    buildMultifamilyValuationConfig()
  );

  assert.equal(
    withEvidence.marketEvidence.averageMonthlyRentPerSqmKrw,
    highEvidenceRent,
    'market evidence rent should flow through from the rent comp'
  );
  assert.equal(
    withEvidence.monthlyRentPerSqmKrw,
    highEvidenceRent,
    'monthly rent must equal the higher market-evidence rent, not the backsolve'
  );
  assert.ok(
    withEvidence.monthlyRentPerSqmKrw > backsolveRent,
    'evidence case rent must exceed the no-evidence backsolve'
  );
  // GPR scales linearly with rent -> the evidence-driven GPR must be ~2x.
  assert.ok(
    withEvidence.grossPotentialRentKrw > noEvidence.grossPotentialRentKrw,
    'evidence-driven GPR must exceed the backsolve-driven GPR'
  );

  // A LOW evidence rent (below the backsolve) must NOT drag rent down: the
  // backsolve acts as a floor.
  const lowEvidence = buildStabilizedIncomeValuation(
    buildBundle(AssetClass.MULTIFAMILY, {
      assetOverrides: { stabilizedOccupancyPct: 90 },
      rentComps: [rentComp(backsolveRent / 2)]
    }),
    {},
    buildMultifamilyValuationConfig()
  );
  assert.equal(
    lowEvidence.monthlyRentPerSqmKrw,
    backsolveRent,
    'a low evidence rent must fall back to the backsolve floor'
  );
});

// ===========================================================================
// FIX 2 — Multifamily jeonse/wolse imputed deposit income.
// otherIncome = 2.5% * GPR  +  (valueBasis * 0.45) * 0.055
// ===========================================================================

const JEONSE_CONVERSION_RATE = 0.055;
const MULTIFAMILY_DEPOSIT_BASIS_SHARE = 0.45;

test('FIX 2: multifamily other income adds imputed jeonse deposit income on top of ancillary', () => {
  // purchasePriceKrw is the value basis (no comparableSet/marketValueProxy here,
  // so valueBasis = marketValueProxy(null) ?? purchasePrice).
  const purchasePriceKrw = 200000000000;
  const valuation = buildStabilizedIncomeValuation(
    buildBundle(AssetClass.MULTIFAMILY, {
      assetOverrides: { stabilizedOccupancyPct: 90, purchasePriceKrw }
    }),
    {},
    buildMultifamilyValuationConfig()
  );

  const ancillaryOtherIncomeKrw = valuation.grossPotentialRentKrw * 0.025;
  const imputedDepositKrw = purchasePriceKrw * MULTIFAMILY_DEPOSIT_BASIS_SHARE;
  const imputedDepositIncomeKrw = imputedDepositKrw * JEONSE_CONVERSION_RATE;
  const expectedOtherIncome = ancillaryOtherIncomeKrw + imputedDepositIncomeKrw;

  // Pin the exact composite formula (locks the 5.5% rate and 45% basis share).
  assert.ok(
    Math.abs(valuation.otherIncomeKrw - expectedOtherIncome) < 1,
    `multifamily other income (${valuation.otherIncomeKrw}) must equal ancillary + imputed deposit (${expectedOtherIncome})`
  );

  // Materially HIGHER than the pure-ancillary 2.5%*GPR baseline by ~the imputed
  // deposit income. valueBasis 200B -> deposit 90B -> income 4.95B, which dwarfs
  // the ancillary line, so the uplift must be substantial.
  assert.ok(
    valuation.otherIncomeKrw > ancillaryOtherIncomeKrw * 2,
    `other income (${valuation.otherIncomeKrw}) must materially exceed the pure-ancillary baseline (${ancillaryOtherIncomeKrw})`
  );
  assert.ok(
    Math.abs(valuation.otherIncomeKrw - ancillaryOtherIncomeKrw - imputedDepositIncomeKrw) < 1,
    'the uplift over ancillary must equal the imputed deposit income'
  );

  // The deposit income alone (200B * 0.45 * 0.055) is exactly 4.95B; pin it so
  // changing the rate or basis share later trips this test.
  assert.equal(imputedDepositIncomeKrw, 4_950_000_000);
});
