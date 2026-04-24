import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSubmarketIntel, buildPortfolioIntel } from '@/lib/services/research/submarket-intel';
import type { SubmarketConvictionInput } from '@/lib/services/research/deal-conviction';
import type {
  CompetitiveIntelInput,
  CompTransaction,
  PipelineDelivery
} from '@/lib/services/research/competitive-intelligence';
import type { DebtDealProfile } from '@/lib/services/valuation/debt-sourcing';
import type { TenantExposure } from '@/lib/services/valuation/tenant-credit';
import type { RawListing, SponsorCriteria } from '@/lib/services/valuation/deal-screener';

const asOf = new Date('2026-04-23T00:00:00Z');
const daysAgo = (n: number) => new Date(asOf.getTime() - n * 86400000);
const daysAhead = (n: number) => new Date(asOf.getTime() + n * 86400000);

const dealProfile: DebtDealProfile = {
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

const tenant: TenantExposure = {
  tenant: {
    companyId: 'C1', companyName: 'Blue Chip', industry: 'TECH',
    fiscalYear: 2025, isListed: true,
    totalAssetsKrw: 500e12, totalLiabilitiesKrw: 100e12,
    currentAssetsKrw: 220e12, currentLiabilitiesKrw: 70e12,
    cashAndEquivalentsKrw: 90e12, totalDebtKrw: 30e12,
    revenueKrw: 300e12, operatingIncomeKrw: 55e12, netIncomeKrw: 45e12,
    interestExpenseKrw: 2e12, operatingCashFlowKrw: 70e12,
    priorYearRevenueKrw: 260e12
  },
  annualRentKrw: 8_000_000_000, leaseRemainingYears: 5
};

const listing: RawListing = {
  listingId: 'L1', channel: 'COURT_AUCTION', assetClass: 'OFFICE',
  province: '서울특별시', district: '강남구', jibunAddress: null,
  appraisalValueKrw: 100e9, minimumBidKrw: 65e9, priorFailedRounds: 1,
  eventDate: daysAhead(45), gfaSqm: 8000, landAreaSqm: 1500,
  estimatedStabilizedNoiKrw: 5_600_000_000, seniorDebtKrw: 45e9,
  encumbrances: ['EXISTING_LEASE'], notes: null
};

const criteria: SponsorCriteria = {
  targetAssetClasses: ['OFFICE'],
  minCheckSizeKrw: 20e9, maxCheckSizeKrw: 500e9,
  minDiscountPct: 15, minEntryCapRatePct: 6.0,
  allowedChannels: ['COURT_AUCTION', 'PUBLIC_DISPOSAL', 'NPL_PORTFOLIO', 'OFF_MARKET'],
  allowedProvinces: ['서울특별시'],
  maxEncumbranceSeverity: 2, executionSpeedWeeks: 16
};

const convictionInput: SubmarketConvictionInput = {
  submarketId: 'SM-GANGNAM',
  submarketLabel: '강남 오피스',
  province: '서울특별시',
  district: '강남구',
  archetypeDealProfile: dealProfile,
  tenantExposures: [tenant],
  listings: [listing],
  sponsorCriteria: criteria
};

const txns: CompTransaction[] = [
  { id: 'T1', dealDate: daysAgo(30), priceKrw: 120e9, gfaSqm: 10000, capRatePct: 5.2, pricePerSqmKrw: 12e6, buyerName: null, sellerName: null, assetLabel: 'A' },
  { id: 'T2', dealDate: daysAgo(75), priceKrw: 95e9, gfaSqm: 8500, capRatePct: 5.5, pricePerSqmKrw: 11.2e6, buyerName: null, sellerName: null, assetLabel: 'B' },
  { id: 'T3', dealDate: daysAgo(200), priceKrw: 80e9, gfaSqm: 7000, capRatePct: 5.7, pricePerSqmKrw: 11.4e6, buyerName: null, sellerName: null, assetLabel: 'C' }
];

const pipeline: PipelineDelivery[] = [
  { id: 'P1', projectName: 'New Tower', expectedDeliveryDate: daysAhead(300), expectedGfaSqm: 30000, developer: null, stage: 'UNDER_CONSTRUCTION' }
];

const competitiveInput: CompetitiveIntelInput = {
  submarketLabel: '강남 오피스',
  asOf,
  subject: { assetLabel: 'Subject', currentCapRatePct: 5.5, currentMonthlyRentKrwPerSqm: 68000, currentOccupancyPct: 94, gfaSqm: 8000 },
  transactions: txns,
  rents: [{ id: 'R1', observationDate: daysAgo(30), monthlyRentKrwPerSqm: 68000, occupancyPct: 94, assetLabel: 'A' }],
  pipeline,
  tenantMoves: [],
  submarketExistingInventorySqm: 800000
};

test('buildSubmarketIntel: combines conviction + competitive + playbook', () => {
  const intel = buildSubmarketIntel({ conviction: convictionInput, competitive: competitiveInput }, asOf);
  assert.equal(intel.submarketId, 'SM-GANGNAM');
  assert.ok(intel.conviction);
  assert.ok(intel.competitive);
  assert.ok(intel.playbook.length > 0);
  assert.equal(intel.executiveSummary.length, 3);
});

test('buildSubmarketIntel: HIGH conviction yields IMMEDIATE bid action', () => {
  const intel = buildSubmarketIntel({ conviction: convictionInput, competitive: competitiveInput }, asOf);
  if (intel.conviction.band === 'HIGH') {
    assert.ok(intel.playbook.some((a) => a.priority === 'IMMEDIATE' && a.category === 'ORIGINATION'));
  }
});

test('buildSubmarketIntel: frozen transaction market surfaces capital-markets action', () => {
  const intel = buildSubmarketIntel(
    { conviction: convictionInput, competitive: { ...competitiveInput, transactions: [] } },
    asOf
  );
  assert.ok(
    intel.playbook.some(
      (a) => a.category === 'CAPITAL_MARKETS' && a.label.includes('exit liquidity')
    )
  );
});

test('buildSubmarketIntel: AVOID band emits pause action', () => {
  const avoidInput: SubmarketConvictionInput = {
    ...convictionInput,
    archetypeDealProfile: {
      ...dealProfile,
      targetLtvPct: 95,
      stabilizedDscr: 0.5,
      stabilizedDebtYieldPct: 2,
      tenantCreditIsInvestmentGrade: false,
      maxUnderwritingWeeks: 1
    },
    tenantExposures: [],
    listings: []
  };
  const intel = buildSubmarketIntel({ conviction: avoidInput, competitive: competitiveInput }, asOf);
  assert.equal(intel.conviction.band, 'AVOID');
  assert.ok(intel.playbook.some((a) => a.label.includes('Pause')));
});

test('buildPortfolioIntel: sorts by descending conviction', () => {
  const weak: SubmarketConvictionInput = {
    ...convictionInput,
    submarketId: 'SM-WEAK',
    submarketLabel: '부실',
    archetypeDealProfile: {
      ...dealProfile, targetLtvPct: 95, stabilizedDscr: 0.5,
      stabilizedDebtYieldPct: 2, tenantCreditIsInvestmentGrade: false,
      maxUnderwritingWeeks: 1
    },
    tenantExposures: [], listings: []
  };
  const portfolio = buildPortfolioIntel(
    [
      { conviction: weak, competitive: competitiveInput },
      { conviction: convictionInput, competitive: competitiveInput }
    ],
    asOf
  );
  assert.equal(portfolio.length, 2);
  assert.ok(portfolio[0]!.conviction.overall >= portfolio[1]!.conviction.overall);
});
