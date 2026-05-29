import assert from 'node:assert/strict';
import test from 'node:test';

import {
  inferKoreanEntityType,
  inferCongestedZone,
  resolveAcquisitionTaxPct,
  resolveExitTaxPct,
  resolveEffectiveCorporateTaxPct
} from '@/lib/services/valuation/inputs';
import {
  computeAnnualJongbuseKrw,
  DEFAULT_FAIR_MARKET_RATIO
} from '@/lib/services/valuation/jongbuse';
import { buildSyntheticProForma } from '@/lib/services/valuation/synthetic-pro-forma';
import type { ProFormaInputs } from '@/lib/services/valuation/synthetic-pro-forma';

// Pinned rates — changing the bracket constants must trip these.
const STANDARD_ACQ = 4.6;
const CORP_CONGESTED_COMMERCIAL_ACQ = 9.4;
const CORP_RESIDENTIAL_ACQ = 13.4;
const CORP_TAX = 24.2;
const LAND_SURTAX = 20;

// ── Entity-type inference from free-text legalStructure ────────────────────
test('inferKoreanEntityType maps Korean + English tokens', () => {
  assert.equal(inferKoreanEntityType('위탁관리리츠 (REIT)'), 'REIT');
  assert.equal(inferKoreanEntityType('부동산투자회사'), 'REIT');
  assert.equal(inferKoreanEntityType('사모 부동산펀드'), 'FUND');
  assert.equal(inferKoreanEntityType('real estate fund'), 'FUND');
  assert.equal(inferKoreanEntityType('프로젝트금융투자회사 PFV'), 'PFV');
  assert.equal(inferKoreanEntityType('개인 (individual)'), 'INDIVIDUAL');
  assert.equal(inferKoreanEntityType('주식회사 SPC'), 'CORPORATION');
  assert.equal(inferKoreanEntityType(null), 'CORPORATION');
});

// ── 과밀억제권역 inference from market / region strings ──────────────────────
test('inferCongestedZone trips on Seoul metropolitan tokens', () => {
  assert.equal(inferCongestedZone('Seoul', null), true);
  assert.equal(inferCongestedZone('서울특별시', null), true);
  assert.equal(inferCongestedZone(null, '경기도 성남'), true);
  assert.equal(inferCongestedZone('인천', null), true);
  assert.equal(inferCongestedZone('Busan', '부산광역시'), false);
  assert.equal(inferCongestedZone('Daejeon', null), false);
});

// ── FIX #1: 취득세 중과 brackets ─────────────────────────────────────────────
test('취득세: standard commercial outside congested zone → 4.6%', () => {
  const r = resolveAcquisitionTaxPct({
    entityType: 'CORPORATION',
    inCongestedZone: false,
    assetClass: 'OFFICE'
  });
  assert.equal(r.ratePct, STANDARD_ACQ);
  assert.equal(r.isOverride, false);
});

test('취득세: 법인 commercial in 과밀억제권역 → 9.4% 중과', () => {
  const r = resolveAcquisitionTaxPct({
    entityType: 'CORPORATION',
    inCongestedZone: true,
    assetClass: 'DATA_CENTER'
  });
  assert.equal(r.ratePct, CORP_CONGESTED_COMMERCIAL_ACQ);
});

test('취득세: 법인 residential → 13.4% 중과', () => {
  const r = resolveAcquisitionTaxPct({
    entityType: 'CORPORATION',
    inCongestedZone: true,
    assetClass: 'MULTIFAMILY'
  });
  assert.equal(r.ratePct, CORP_RESIDENTIAL_ACQ);
});

test('취득세: explicit override wins over brackets (real data)', () => {
  const r = resolveAcquisitionTaxPct({
    entityType: 'CORPORATION',
    inCongestedZone: true,
    assetClass: 'OFFICE',
    overridePct: 3.5
  });
  assert.equal(r.ratePct, 3.5);
  assert.equal(r.isOverride, true);
});

test('취득세: individual is not subject to 대도시 법인 중과', () => {
  const r = resolveAcquisitionTaxPct({
    entityType: 'INDIVIDUAL',
    inCongestedZone: true,
    assetClass: 'OFFICE'
  });
  assert.equal(r.ratePct, STANDARD_ACQ);
});

// ── FIX #2: exit tax reuses corporate rate, not 1% ─────────────────────────
test('exit tax: 법인 uses corporate rate, not the 1% placeholder', () => {
  const r = resolveExitTaxPct({ entityType: 'CORPORATION', corporateTaxPct: CORP_TAX });
  assert.equal(r.ratePct, CORP_TAX);
  assert.notEqual(r.ratePct, 1);
});

test('exit tax: non-business land carries +20%p surtax', () => {
  const r = resolveExitTaxPct({
    entityType: 'CORPORATION',
    corporateTaxPct: CORP_TAX,
    isNonBusinessLand: true
  });
  assert.equal(r.ratePct, CORP_TAX + LAND_SURTAX);
});

test('exit tax: explicit override wins', () => {
  const r = resolveExitTaxPct({
    entityType: 'CORPORATION',
    corporateTaxPct: CORP_TAX,
    overridePct: 1
  });
  assert.equal(r.ratePct, 1);
  assert.equal(r.isOverride, true);
});

// ── FIX #3: REIT / 펀드 / PFV pass-through ──────────────────────────────────
test('pass-through: REIT vehicle corporate tax ≈ 0', () => {
  const r = resolveEffectiveCorporateTaxPct({ entityType: 'REIT', corporateTaxPct: CORP_TAX });
  assert.equal(r.ratePct, 0);
  assert.equal(r.isPassThrough, true);
});

test('pass-through: 부동산펀드 and PFV also ≈ 0', () => {
  assert.equal(
    resolveEffectiveCorporateTaxPct({ entityType: 'FUND', corporateTaxPct: CORP_TAX }).ratePct,
    0
  );
  assert.equal(
    resolveEffectiveCorporateTaxPct({ entityType: 'PFV', corporateTaxPct: CORP_TAX }).ratePct,
    0
  );
});

test('pass-through: ordinary 법인 keeps the full corporate rate', () => {
  const r = resolveEffectiveCorporateTaxPct({
    entityType: 'CORPORATION',
    corporateTaxPct: CORP_TAX
  });
  assert.equal(r.ratePct, CORP_TAX);
  assert.equal(r.isPassThrough, false);
});

// ── FIX #4: 종부세 공정시장가액비율 applied to taxable base ────────────────────
test('종부세: fairMarketRatio haircuts 법인 주택 taxable base', () => {
  const full = computeAnnualJongbuseKrw({
    assetClass: 'MULTIFAMILY',
    purchasePriceKrw: 10_000_000_000,
    landValuePct: 20,
    fairMarketRatio: 1
  });
  const haircut = computeAnnualJongbuseKrw({
    assetClass: 'MULTIFAMILY',
    purchasePriceKrw: 10_000_000_000,
    landValuePct: 20,
    fairMarketRatio: DEFAULT_FAIR_MARKET_RATIO
  });
  // 100억 × 0.65 공시 × 0.6 공정시장 × 2.7%
  assert.equal(
    haircut.annualJongbuseKrw,
    Math.round(10_000_000_000 * 0.65 * DEFAULT_FAIR_MARKET_RATIO * 0.027)
  );
  assert.equal(
    haircut.taxableBasisKrw,
    Math.round(10_000_000_000 * 0.65 * DEFAULT_FAIR_MARKET_RATIO)
  );
  // Haircut base is strictly lower than the un-ratio'd base.
  assert.ok(haircut.annualJongbuseKrw < full.annualJongbuseKrw);
  assert.equal(
    haircut.annualJongbuseKrw,
    Math.round(full.annualJongbuseKrw * DEFAULT_FAIR_MARKET_RATIO)
  );
});

test('종부세: separate-land base also reflects fairMarketRatio', () => {
  const haircut = computeAnnualJongbuseKrw({
    assetClass: 'OFFICE',
    purchasePriceKrw: 200_000_000_000,
    landValuePct: 25,
    fairMarketRatio: DEFAULT_FAIR_MARKET_RATIO
  });
  // land assessed = 2000억 × 0.65 × 0.25 = 325억; (325-80)억 × 0.6 = 147억 base
  const expectedBase = Math.round(
    Math.max(0, 200_000_000_000 * 0.65 * 0.25 - 8_000_000_000) * DEFAULT_FAIR_MARKET_RATIO
  );
  assert.equal(haircut.taxableBasisKrw, expectedBase);
  assert.equal(haircut.method, 'SEPARATE_LAND');
});

// ── Engine integration: synthetic pro-forma exit tax + jongbuse ────────────
function baseProForma(overrides: Partial<ProFormaInputs> = {}): ProFormaInputs {
  return {
    purchasePriceKrw: 100_000_000_000,
    ltvPct: 50,
    interestRatePct: 5,
    amortTermMonths: 180,
    capRatePct: 6,
    exitCapRatePct: 6,
    year1Noi: 6_000_000_000,
    growthPct: 2,
    opexRatio: 0.3,
    propertyTaxPct: 0.25,
    insurancePct: 0.08,
    corpTaxPct: 24.2,
    exitTaxPct: 24.2, // resolved corp rate, NOT the 1% placeholder
    acquisitionTaxPct: 9.4, // resolved 과밀 법인 commercial 중과
    landValuePct: 30,
    depreciationYears: 40,
    exitCostPct: 1.5,
    propertyTaxGrowthPct: 3,
    assetClass: 'OFFICE',
    ...overrides
  };
}

test('synthetic pro-forma: 중과 취득세 raises totalBasis vs standard', () => {
  const heavy = buildSyntheticProForma(baseProForma({ acquisitionTaxPct: 9.4 }));
  const standard = buildSyntheticProForma(baseProForma({ acquisitionTaxPct: 4.6 }));
  assert.equal(heavy.extras.acquisitionTaxKrw, Math.round(100_000_000_000 * 0.094));
  assert.equal(standard.extras.acquisitionTaxKrw, Math.round(100_000_000_000 * 0.046));
  assert.ok(heavy.extras.totalBasisKrw > standard.extras.totalBasisKrw);
});

test('synthetic pro-forma: exit tax uses corp rate (24.2%) not 1%', () => {
  const corp = buildSyntheticProForma(baseProForma({ exitTaxPct: 24.2 }));
  const placeholder = buildSyntheticProForma(baseProForma({ exitTaxPct: 1 }));
  // Higher exit-tax rate must reduce net exit proceeds materially.
  assert.ok(
    corp.proForma.summary.netExitProceedsKrw < placeholder.proForma.summary.netExitProceedsKrw
  );
});

test('synthetic pro-forma: 종부세 year-1 reflects 공정시장가액비율', () => {
  const ratio06 = buildSyntheticProForma(baseProForma({ jongbuseFairMarketRatio: 0.6 }));
  const ratio10 = buildSyntheticProForma(baseProForma({ jongbuseFairMarketRatio: 1 }));
  assert.ok(ratio06.extras.jongbuseYear1Krw < ratio10.extras.jongbuseYear1Krw);
  // The 0.6-ratio jongbuse should be ~0.6× the un-ratio'd one (progressive
  // brackets are linear within a slice, so the ratio holds closely).
  assert.ok(ratio06.extras.jongbuseYear1Krw > 0);
});
