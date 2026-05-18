import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_LENDER_CATALOG,
  evaluateLender,
  sourceDebt,
  type DebtDealProfile
} from '@/lib/services/valuation/debt-sourcing';

const stabilizedSeoulOffice: DebtDealProfile = {
  assetClass: 'OFFICE',
  stage: 'STABILIZED',
  totalDealSizeKrw: 400_000_000_000,
  debtNeedKrw: 220_000_000_000,
  targetLtvPct: 55,
  stabilizedDscr: 1.35,
  stabilizedDebtYieldPct: 9.0,
  province: '서울특별시',
  district: '강남구',
  instrumentPreference: ['SENIOR_TERM'],
  tenantCreditIsInvestmentGrade: true,
  maxUnderwritingWeeks: 12
};

test('sourceDebt: prime Seoul office yields multiple institutional lenders', () => {
  const result = sourceDebt(stabilizedSeoulOffice);
  assert.ok(result.eligibleCount >= 3);
  // Big-4 banks, insurance, pension should all be in the shortlist.
  const codes = result.recommendedTopN.map((m) => m.lender.code);
  assert.ok(codes.includes('BANK_BIG4_SENIOR') || codes.includes('INS_LIFE_PRIME'));
});

test('sourceDebt: top recommendation has lowest-ish spread among eligible', () => {
  const result = sourceDebt(stabilizedSeoulOffice);
  const first = result.recommendedTopN[0]!;
  assert.ok(first.indicativeSpreadBps !== null);
  assert.ok(first.indicativeAllInRatePct! > 3.6); // above benchmark
  assert.ok(first.indicativeAllInRatePct! < 8); // not a bridge-lender rate
});

test('sourceDebt: LTV too aggressive filters out senior banks', () => {
  const aggressive = { ...stabilizedSeoulOffice, targetLtvPct: 72 };
  const result = sourceDebt(aggressive);
  const senior = result.shortlist.find((s) => s.lender.code === 'BANK_BIG4_SENIOR')!;
  assert.equal(senior.eligible, false);
  assert.ok(senior.reasons.some((r) => r.includes('LTV')));
  // Mezz or bridge should step in.
  assert.ok(result.eligibleCount >= 1);
});

test('sourceDebt: construction stage routes to bridge / construction PF lenders', () => {
  const construction: DebtDealProfile = {
    ...stabilizedSeoulOffice,
    stage: 'CONSTRUCTION',
    targetLtvPct: 65,
    stabilizedDscr: 0, // pre-stabilization
    stabilizedDebtYieldPct: 0
  };
  const result = sourceDebt(construction);
  const codes = result.recommendedTopN.map((m) => m.lender.code);
  // Construction PF lenders should show up; senior term banks should NOT.
  assert.ok(
    codes.some((c) => c.includes('CONSTRUCTION') || c.includes('BRIDGE') || c === 'SEC_BRIDGE')
  );
  assert.ok(!codes.includes('INS_LIFE_PRIME')); // life insurance stays out of construction
});

test('sourceDebt: sub-IG tenant filters out conservative lenders', () => {
  const subIg = { ...stabilizedSeoulOffice, tenantCreditIsInvestmentGrade: false };
  const result = sourceDebt(subIg);
  const npsMatch = result.shortlist.find((s) => s.lender.code === 'PENSION_NPS_CORE')!;
  assert.equal(npsMatch.eligible, false);
  assert.ok(npsMatch.reasons.some((r) => r.includes('investment-grade')));
});

test('sourceDebt: deal below min ticket size filters out pension + large banks', () => {
  const small: DebtDealProfile = {
    ...stabilizedSeoulOffice,
    totalDealSizeKrw: 20_000_000_000,
    debtNeedKrw: 12_000_000_000
  };
  const result = sourceDebt(small);
  const nps = result.shortlist.find((s) => s.lender.code === 'PENSION_NPS_CORE')!;
  assert.equal(nps.eligible, false);
  assert.ok(nps.reasons.some((r) => r.includes('minimum deal size')));
  // Savings bank / capital should remain.
  const codes = result.recommendedTopN.map((m) => m.lender.code);
  assert.ok(codes.some((c) => c.includes('CAP_') || c.includes('SAVBANK')));
});

test('sourceDebt: regional asset outside Seoul loses prime-only lenders', () => {
  const regional: DebtDealProfile = {
    ...stabilizedSeoulOffice,
    province: '전라남도',
    district: '목포시'
  };
  const result = sourceDebt(regional);
  const ins = result.shortlist.find((s) => s.lender.code === 'INS_LIFE_PRIME')!;
  assert.equal(ins.eligible, false);
  // National lenders (bank_big4, cap_short) should still be eligible.
  const codes = result.recommendedTopN.map((m) => m.lender.code);
  assert.ok(codes.length > 0);
});

test('sourceDebt: no eligible lender gives fallback rationale', () => {
  const impossible: DebtDealProfile = {
    ...stabilizedSeoulOffice,
    targetLtvPct: 95, // way too high
    stabilizedDscr: 0.5,
    stabilizedDebtYieldPct: 2.0,
    tenantCreditIsInvestmentGrade: false,
    maxUnderwritingWeeks: 1 // too fast
  };
  const result = sourceDebt(impossible);
  assert.equal(result.eligibleCount, 0);
  assert.ok(result.fallbackRationale);
  assert.ok(
    result.fallbackRationale!.includes('restructuring') ||
      result.fallbackRationale!.includes('No eligible')
  );
});

test('evaluateLender: indicative spread scales with LTV above midpoint', () => {
  const senior = DEFAULT_LENDER_CATALOG.find((l) => l.code === 'BANK_BIG4_SENIOR')!;
  const low = evaluateLender(senior, { ...stabilizedSeoulOffice, targetLtvPct: 50 });
  const high = evaluateLender(senior, { ...stabilizedSeoulOffice, targetLtvPct: 60 });
  assert.ok(high.indicativeSpreadBps! > low.indicativeSpreadBps!);
});

test('sourceDebt: data center asset routed to DC-focused insurance lender', () => {
  const dcDeal: DebtDealProfile = {
    ...stabilizedSeoulOffice,
    assetClass: 'DATA_CENTER',
    totalDealSizeKrw: 800_000_000_000,
    debtNeedKrw: 480_000_000_000,
    province: '경기도',
    district: '평택시'
  };
  const result = sourceDebt(dcDeal);
  const codes = result.recommendedTopN.map((m) => m.lender.code);
  assert.ok(
    codes.includes('INS_DC_INFRA') ||
      codes.includes('BANK_IBK_IND') ||
      codes.includes('FGN_OFFSHORE_FUND')
  );
});
