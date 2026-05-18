import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assessCredit,
  computeRatios,
  projectRentDefault,
  GRADE_PD_CURVE,
  type TenantFinancials,
  type TenantExposure
} from '@/lib/services/valuation/tenant-credit';

const blueChipSamsungLike: TenantFinancials = {
  companyId: 'LISTED_00126380',
  companyName: '삼성전자-like',
  industry: 'TECH',
  fiscalYear: 2025,
  isListed: true,
  totalAssetsKrw: 500_000_000_000_000,
  totalLiabilitiesKrw: 120_000_000_000_000,
  currentAssetsKrw: 220_000_000_000_000,
  currentLiabilitiesKrw: 80_000_000_000_000,
  cashAndEquivalentsKrw: 90_000_000_000_000,
  totalDebtKrw: 40_000_000_000_000,
  revenueKrw: 300_000_000_000_000,
  operatingIncomeKrw: 55_000_000_000_000,
  netIncomeKrw: 45_000_000_000_000,
  interestExpenseKrw: 2_000_000_000_000,
  operatingCashFlowKrw: 70_000_000_000_000,
  priorYearRevenueKrw: 260_000_000_000_000
};

const midTierManufacturer: TenantFinancials = {
  companyId: 'UNLISTED_MID_001',
  companyName: '중견 제조기업',
  industry: 'MANUFACTURING',
  fiscalYear: 2025,
  isListed: false,
  totalAssetsKrw: 80_000_000_000,
  totalLiabilitiesKrw: 50_000_000_000,
  currentAssetsKrw: 25_000_000_000,
  currentLiabilitiesKrw: 20_000_000_000,
  cashAndEquivalentsKrw: 4_000_000_000,
  totalDebtKrw: 30_000_000_000,
  revenueKrw: 60_000_000_000,
  operatingIncomeKrw: 3_500_000_000,
  netIncomeKrw: 1_800_000_000,
  interestExpenseKrw: 1_400_000_000,
  operatingCashFlowKrw: 3_200_000_000,
  priorYearRevenueKrw: 58_000_000_000
};

const distressedFnb: TenantFinancials = {
  companyId: 'UNLISTED_FNB_001',
  companyName: '부실 F&B',
  industry: 'F_AND_B',
  fiscalYear: 2025,
  isListed: false,
  totalAssetsKrw: 10_000_000_000,
  totalLiabilitiesKrw: 9_500_000_000,
  currentAssetsKrw: 2_500_000_000,
  currentLiabilitiesKrw: 4_000_000_000,
  cashAndEquivalentsKrw: 300_000_000,
  totalDebtKrw: 7_000_000_000,
  revenueKrw: 8_000_000_000,
  operatingIncomeKrw: -500_000_000,
  netIncomeKrw: -900_000_000,
  interestExpenseKrw: 450_000_000,
  operatingCashFlowKrw: -300_000_000,
  priorYearRevenueKrw: 10_500_000_000
};

test('computeRatios: derives standard Korean credit ratios', () => {
  const ratios = computeRatios(midTierManufacturer);
  assert.ok(ratios.currentRatio > 1.2 && ratios.currentRatio < 1.3);
  assert.ok(ratios.debtToEquityPct > 150 && ratios.debtToEquityPct < 200);
  assert.ok(ratios.interestCoverage !== null && ratios.interestCoverage > 2);
  assert.ok(ratios.revenueGrowthPct !== null && ratios.revenueGrowthPct > 0);
});

test('assessCredit: blue-chip listed tech scores AAA or AA', () => {
  const a = assessCredit(blueChipSamsungLike);
  assert.ok(['AAA', 'AA'].includes(a.grade));
  assert.equal(a.isInvestmentGrade, true);
  assert.ok(a.numericScore >= 80);
  assert.ok(a.watchFlags.length === 0);
});

test('assessCredit: distressed F&B scores sub-IG with watch flags', () => {
  const a = assessCredit(distressedFnb);
  assert.equal(a.isInvestmentGrade, false);
  assert.ok(['CCC', 'B', 'BB'].includes(a.grade));
  assert.ok(a.watchFlags.some((f) => f.includes('Negative operating income')));
  assert.ok(a.watchFlags.some((f) => f.includes('cash flow') || f.includes('operating')));
});

test('assessCredit: mid-tier lands in A / BBB / BB range', () => {
  const a = assessCredit(midTierManufacturer);
  assert.ok(['A', 'BBB', 'BB'].includes(a.grade));
});

test('assessCredit: PD curve is monotonic AAA→CCC', () => {
  const grades = ['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'CCC'] as const;
  for (let i = 1; i < grades.length; i++) {
    assert.ok(
      GRADE_PD_CURVE[grades[i]!] > GRADE_PD_CURVE[grades[i - 1]!],
      `PD must increase from ${grades[i - 1]} to ${grades[i]}`
    );
  }
});

test('assessCredit: industry adjustment penalizes F&B vs tech at same ratios', () => {
  const baseTech: TenantFinancials = { ...midTierManufacturer, industry: 'TECH' };
  const baseFnb: TenantFinancials = { ...midTierManufacturer, industry: 'F_AND_B' };
  const techScore = assessCredit(baseTech).numericScore;
  const fnbScore = assessCredit(baseFnb).numericScore;
  assert.ok(techScore > fnbScore);
  assert.ok(techScore - fnbScore >= 6); // tech +2, F&B -5 → delta 7
});

test('assessCredit: listed bonus boosts numeric score', () => {
  const listed = assessCredit({ ...midTierManufacturer, isListed: true });
  const unlisted = assessCredit({ ...midTierManufacturer, isListed: false });
  assert.ok(listed.numericScore > unlisted.numericScore);
});

test('assessCredit: interest coverage < 1 triggers 한계기업 flag', () => {
  const zombie: TenantFinancials = {
    ...midTierManufacturer,
    operatingIncomeKrw: 500_000_000,
    interestExpenseKrw: 1_400_000_000
  };
  const a = assessCredit(zombie);
  assert.ok(a.watchFlags.some((f) => f.includes('한계기업') || f.includes('Interest coverage')));
});

test('projectRentDefault: AAA tenant produces near-zero expected loss', () => {
  const exposure: TenantExposure[] = [
    {
      tenant: blueChipSamsungLike,
      annualRentKrw: 10_000_000_000,
      leaseRemainingYears: 5
    }
  ];
  const result = projectRentDefault(exposure);
  assert.ok(result.expectedAnnualRentLossKrw < result.totalAnnualRentKrw * 0.001);
  assert.ok(result.effectiveCreditReservePct < 0.05);
});

test('projectRentDefault: mixed roll yields rent-weighted PD and reserve', () => {
  const exposures: TenantExposure[] = [
    { tenant: blueChipSamsungLike, annualRentKrw: 6_000_000_000, leaseRemainingYears: 5 },
    { tenant: midTierManufacturer, annualRentKrw: 3_000_000_000, leaseRemainingYears: 3 },
    { tenant: distressedFnb, annualRentKrw: 1_000_000_000, leaseRemainingYears: 2 }
  ];
  const result = projectRentDefault(exposures);
  assert.equal(result.totalAnnualRentKrw, 10_000_000_000);
  assert.ok(result.weightedPd1yrPct > 0);
  assert.ok(result.expectedAnnualRentLossKrw > 0);
  assert.ok(result.adjustedAnnualRentKrw < result.totalAnnualRentKrw);
  assert.equal(result.breakdown.length, 3);
  // Distressed tenant contributes the most expected loss despite smallest rent.
  const distressedLoss = result.breakdown.find(
    (b) => b.companyName === '부실 F&B'
  )!.expectedAnnualLossKrw;
  const blueChipLoss = result.breakdown.find(
    (b) => b.companyName === '삼성전자-like'
  )!.expectedAnnualLossKrw;
  assert.ok(distressedLoss > blueChipLoss);
});

test('projectRentDefault: custom LGD scales the reserve linearly', () => {
  const exposures: TenantExposure[] = [
    { tenant: midTierManufacturer, annualRentKrw: 5_000_000_000, leaseRemainingYears: 5 }
  ];
  const base = projectRentDefault(exposures, 25);
  const doubled = projectRentDefault(exposures, 50);
  assert.ok(Math.abs(doubled.expectedAnnualRentLossKrw - 2 * base.expectedAnnualRentLossKrw) < 1);
});
