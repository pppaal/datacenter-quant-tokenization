import assert from 'node:assert/strict';
import test from 'node:test';
import {
  scorePortfolioConviction,
  scoreSubmarketConviction,
  type SubmarketConvictionInput
} from '@/lib/services/research/deal-conviction';
import type { DebtDealProfile } from '@/lib/services/valuation/debt-sourcing';
import type { TenantExposure } from '@/lib/services/valuation/tenant-credit';
import type { RawListing, SponsorCriteria } from '@/lib/services/valuation/deal-screener';

const today = new Date('2026-04-23T00:00:00Z');
const inSixWeeks = new Date('2026-06-04T00:00:00Z');

const seoulOfficeProfile: DebtDealProfile = {
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

const strongTenant: TenantExposure = {
  tenant: {
    companyId: 'C1',
    companyName: '블루칩 테크',
    industry: 'TECH',
    fiscalYear: 2025,
    isListed: true,
    totalAssetsKrw: 500_000_000_000_000,
    totalLiabilitiesKrw: 100_000_000_000_000,
    currentAssetsKrw: 220_000_000_000_000,
    currentLiabilitiesKrw: 70_000_000_000_000,
    cashAndEquivalentsKrw: 90_000_000_000_000,
    totalDebtKrw: 30_000_000_000_000,
    revenueKrw: 300_000_000_000_000,
    operatingIncomeKrw: 55_000_000_000_000,
    netIncomeKrw: 45_000_000_000_000,
    interestExpenseKrw: 2_000_000_000_000,
    operatingCashFlowKrw: 70_000_000_000_000,
    priorYearRevenueKrw: 260_000_000_000_000
  },
  annualRentKrw: 8_000_000_000,
  leaseRemainingYears: 5
};

const seoulListingGood: RawListing = {
  listingId: 'COURT-SEOUL-1',
  channel: 'COURT_AUCTION',
  assetClass: 'OFFICE',
  province: '서울특별시',
  district: '강남구',
  jibunAddress: '서울특별시 강남구 역삼동 123-4',
  appraisalValueKrw: 100_000_000_000,
  minimumBidKrw: 65_000_000_000,
  priorFailedRounds: 1,
  eventDate: inSixWeeks,
  gfaSqm: 8_000,
  landAreaSqm: 1_500,
  estimatedStabilizedNoiKrw: 5_600_000_000,
  seniorDebtKrw: 45_000_000_000,
  encumbrances: ['EXISTING_LEASE'],
  notes: null
};

const seoulListingMid: RawListing = {
  ...seoulListingGood,
  listingId: 'COURT-SEOUL-2',
  minimumBidKrw: 78_000_000_000 // 22% discount — still passes
};

const criteria: SponsorCriteria = {
  targetAssetClasses: ['OFFICE', 'RETAIL', 'INDUSTRIAL', 'MIXED_USE'],
  minCheckSizeKrw: 20_000_000_000,
  maxCheckSizeKrw: 500_000_000_000,
  minDiscountPct: 15,
  minEntryCapRatePct: 6.0,
  allowedChannels: ['COURT_AUCTION', 'PUBLIC_DISPOSAL', 'NPL_PORTFOLIO', 'OFF_MARKET'],
  allowedProvinces: ['서울특별시', '경기도', '인천광역시'],
  maxEncumbranceSeverity: 2,
  executionSpeedWeeks: 16
};

const primeSeoul: SubmarketConvictionInput = {
  submarketId: 'SM-GANGNAM',
  submarketLabel: '서울 강남 오피스',
  province: '서울특별시',
  district: '강남구',
  archetypeDealProfile: seoulOfficeProfile,
  tenantExposures: [strongTenant],
  listings: [seoulListingGood, seoulListingMid],
  sponsorCriteria: criteria
};

test('scoreSubmarketConviction: prime Seoul lands in HIGH or MODERATE band', () => {
  const score = scoreSubmarketConviction(primeSeoul, today);
  assert.ok(['HIGH', 'MODERATE'].includes(score.band));
  assert.ok(score.overall >= 50);
  assert.equal(score.components.length, 3);
  assert.ok(score.components.every((c) => c.score >= 0 && c.score <= 100));
  assert.ok(score.headline.includes('강남'));
});

test('scoreSubmarketConviction: weights sum to 1.0', () => {
  const score = scoreSubmarketConviction(primeSeoul, today);
  const totalWeight = score.components.reduce((sum, c) => sum + c.weight, 0);
  assert.ok(Math.abs(totalWeight - 1) < 1e-9);
});

test('scoreSubmarketConviction: empty tenant roster yields neutral tenant score', () => {
  const input: SubmarketConvictionInput = { ...primeSeoul, tenantExposures: [] };
  const score = scoreSubmarketConviction(input, today);
  const tenantComp = score.components.find((c) => c.name === 'Tenant credit quality')!;
  assert.equal(tenantComp.score, 50);
  assert.equal(score.tenantCredit, null);
});

test('scoreSubmarketConviction: no listings yields dry pipeline signal', () => {
  const input: SubmarketConvictionInput = { ...primeSeoul, listings: [] };
  const score = scoreSubmarketConviction(input, today);
  const pipelineComp = score.components.find((c) => c.name === 'Deal pipeline fit')!;
  assert.ok(pipelineComp.rationale.includes('No live listings'));
});

test('scoreSubmarketConviction: impossible deal profile tanks debt score', () => {
  const brokenProfile: DebtDealProfile = {
    ...seoulOfficeProfile,
    targetLtvPct: 95,
    stabilizedDscr: 0.5,
    stabilizedDebtYieldPct: 2,
    tenantCreditIsInvestmentGrade: false,
    maxUnderwritingWeeks: 1
  };
  const input: SubmarketConvictionInput = {
    ...primeSeoul,
    archetypeDealProfile: brokenProfile
  };
  const score = scoreSubmarketConviction(input, today);
  const debtComp = score.components.find((c) => c.name === 'Debt financeability')!;
  assert.ok(debtComp.score <= 25);
});

test('scoreSubmarketConviction: AVOID band produces pause action', () => {
  const brokenProfile: DebtDealProfile = {
    ...seoulOfficeProfile,
    targetLtvPct: 95,
    stabilizedDscr: 0.5,
    stabilizedDebtYieldPct: 2,
    tenantCreditIsInvestmentGrade: false,
    maxUnderwritingWeeks: 1
  };
  const input: SubmarketConvictionInput = {
    ...primeSeoul,
    archetypeDealProfile: brokenProfile,
    tenantExposures: [],
    listings: []
  };
  const score = scoreSubmarketConviction(input, today);
  assert.equal(score.band, 'AVOID');
  assert.ok(score.topActions.some((a) => a.includes('Pause')));
});

test('scorePortfolioConviction: median + top-ranked + avoid list populated', () => {
  const weakInput: SubmarketConvictionInput = {
    ...primeSeoul,
    submarketId: 'SM-WEAK',
    submarketLabel: '부실 Submarket',
    archetypeDealProfile: {
      ...seoulOfficeProfile,
      targetLtvPct: 95,
      stabilizedDscr: 0.5,
      stabilizedDebtYieldPct: 2,
      tenantCreditIsInvestmentGrade: false,
      maxUnderwritingWeeks: 1
    },
    tenantExposures: [],
    listings: []
  };
  const report = scorePortfolioConviction([primeSeoul, weakInput], today);
  assert.equal(report.submarkets.length, 2);
  assert.ok(report.portfolioMedianScore > 0);
  assert.ok(report.avoidList.some((s) => s.submarketId === 'SM-WEAK'));
});
