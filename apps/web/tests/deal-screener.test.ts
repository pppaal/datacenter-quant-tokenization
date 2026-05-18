import assert from 'node:assert/strict';
import test from 'node:test';
import {
  encumbranceSeverity,
  impliedDiscountPct,
  impliedEntryCapRatePct,
  screenListing,
  screenPipeline,
  type RawListing,
  type SponsorCriteria
} from '@/lib/services/valuation/deal-screener';

const today = new Date('2026-04-22T00:00:00Z');
const twoMonthsOut = new Date('2026-06-22T00:00:00Z');

const baseCriteria: SponsorCriteria = {
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

const seoulAuctionOffice: RawListing = {
  listingId: 'COURT-2026-12345',
  channel: 'COURT_AUCTION',
  assetClass: 'OFFICE',
  province: '서울특별시',
  district: '강남구',
  jibunAddress: '서울특별시 강남구 역삼동 123-4',
  appraisalValueKrw: 100_000_000_000,
  minimumBidKrw: 70_000_000_000,
  priorFailedRounds: 1,
  eventDate: twoMonthsOut,
  gfaSqm: 8_000,
  landAreaSqm: 1_500,
  estimatedStabilizedNoiKrw: 5_600_000_000,
  seniorDebtKrw: 45_000_000_000,
  encumbrances: ['EXISTING_LEASE'],
  notes: '유찰 1회, 임차인 승계 조건'
};

test('impliedDiscountPct / impliedEntryCapRatePct compute correctly', () => {
  assert.equal(Math.round(impliedDiscountPct(seoulAuctionOffice)), 30);
  const cap = impliedEntryCapRatePct(seoulAuctionOffice);
  assert.ok(cap !== null && cap > 7.9 && cap < 8.1);
});

test('encumbranceSeverity: returns worst tag severity', () => {
  assert.equal(encumbranceSeverity([]), 0);
  assert.equal(encumbranceSeverity(['CLEAN_TITLE']), 0);
  assert.equal(encumbranceSeverity(['EXISTING_LEASE', 'SMALL_CLAIMS']), 1);
  assert.equal(encumbranceSeverity(['EXISTING_LEASE', 'LIEN_HOLDER_CLAIM']), 3);
  assert.equal(encumbranceSeverity(['TAX_LIEN', 'ENVIRONMENTAL_FLAG']), 2);
});

test('screenListing: prime Seoul auction passes and scores high', () => {
  const score = screenListing(seoulAuctionOffice, baseCriteria, today);
  assert.equal(score.passesHardFilters, true);
  assert.ok(score.fitScore >= 40);
  assert.equal(score.encumbranceSeverityScore, 1);
});

test('screenListing: discount below minimum hard-fails', () => {
  const listing: RawListing = {
    ...seoulAuctionOffice,
    minimumBidKrw: 92_000_000_000 // only 8% discount
  };
  const score = screenListing(listing, baseCriteria, today);
  assert.equal(score.passesHardFilters, false);
  assert.ok(score.reasons.some((r) => r.includes('Discount')));
});

test('screenListing: lien-holder claim (유치권) hard-fails at default tolerance', () => {
  const listing: RawListing = {
    ...seoulAuctionOffice,
    encumbrances: ['LIEN_HOLDER_CLAIM']
  };
  const score = screenListing(listing, baseCriteria, today);
  assert.equal(score.passesHardFilters, false);
  assert.equal(score.encumbranceSeverityScore, 3);
  assert.ok(score.reasons.some((r) => r.includes('Encumbrance')));
});

test('screenListing: asset class outside mandate rejected', () => {
  const listing: RawListing = {
    ...seoulAuctionOffice,
    assetClass: 'HOTEL'
  };
  const score = screenListing(listing, baseCriteria, today);
  assert.equal(score.passesHardFilters, false);
  assert.ok(score.reasons.some((r) => r.includes('HOTEL')));
});

test('screenListing: channel filter rejects BROKER_LISTING when not allowed', () => {
  const listing: RawListing = {
    ...seoulAuctionOffice,
    channel: 'BROKER_LISTING'
  };
  const score = screenListing(listing, baseCriteria, today);
  assert.equal(score.passesHardFilters, false);
  assert.ok(score.reasons.some((r) => r.includes('Channel')));
});

test('screenListing: regional listing outside province mandate rejected', () => {
  const listing: RawListing = {
    ...seoulAuctionOffice,
    province: '전라남도',
    district: '목포시'
  };
  const score = screenListing(listing, baseCriteria, today);
  assert.equal(score.passesHardFilters, false);
  assert.ok(score.reasons.some((r) => r.includes('전라남도')));
});

test('screenListing: three+ failed rounds flagged as stale', () => {
  const listing: RawListing = {
    ...seoulAuctionOffice,
    priorFailedRounds: 3,
    appraisalValueKrw: 100_000_000_000,
    minimumBidKrw: 55_000_000_000 // 45% discount, well past sponsor floor
  };
  const score = screenListing(listing, baseCriteria, today);
  assert.ok(score.nextActions.some((a) => a.includes('권리분석') || a.includes('failed')));
});

test('screenListing: off-market deal gets channel bonus', () => {
  const offMarket: RawListing = {
    ...seoulAuctionOffice,
    channel: 'OFF_MARKET',
    priorFailedRounds: 0
  };
  const court = screenListing({ ...seoulAuctionOffice, priorFailedRounds: 0 }, baseCriteria, today);
  const off = screenListing(offMarket, baseCriteria, today);
  assert.ok(off.fitScore > court.fitScore);
});

test('screenListing: senior debt > 90% of appraisal penalizes score', () => {
  const overLeveraged: RawListing = {
    ...seoulAuctionOffice,
    seniorDebtKrw: 92_000_000_000
  };
  const normal = screenListing(seoulAuctionOffice, baseCriteria, today);
  const thin = screenListing(overLeveraged, baseCriteria, today);
  assert.ok(thin.fitScore < normal.fitScore);
  assert.ok(thin.reasons.some((r) => r.includes('equity cushion')));
});

test('screenPipeline: ranks passing listings by fit score', () => {
  const shallow: RawListing = {
    ...seoulAuctionOffice,
    listingId: 'SHALLOW',
    minimumBidKrw: 82_000_000_000 // 18% discount — passes but marginal
  };
  const deep: RawListing = {
    ...seoulAuctionOffice,
    listingId: 'DEEP',
    minimumBidKrw: 55_000_000_000 // 45% discount
  };
  const rejected: RawListing = {
    ...seoulAuctionOffice,
    listingId: 'REJECT',
    assetClass: 'HOTEL'
  };
  const report = screenPipeline([shallow, deep, rejected], baseCriteria, today);
  assert.equal(report.evaluatedCount, 3);
  assert.equal(report.passCount, 2);
  assert.equal(report.rejected.length, 1);
  assert.equal(report.topRanked[0]!.listing.listingId, 'DEEP');
});

test('screenPipeline: empty input yields zero report', () => {
  const report = screenPipeline([], baseCriteria, today);
  assert.equal(report.evaluatedCount, 0);
  assert.equal(report.passCount, 0);
  assert.equal(report.topRanked.length, 0);
});
