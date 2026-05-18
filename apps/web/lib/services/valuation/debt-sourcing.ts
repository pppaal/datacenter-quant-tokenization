/**
 * Debt sourcing engine — matches a deal profile against a catalog of Korean
 * commercial-real-estate lenders.
 *
 * Why this exists:
 *   The valuation engine assumes a single "debt at X% / LTV Y%" line. In
 *   practice, whether that debt is financeable at all depends on which
 *   lenders will even look at the deal. Korean CRE debt has a fragmented
 *   lender base — senior banks, 보험사 (insurance), 연기금 (pension), mezz
 *   funds, 캐피탈 (consumer finance affiliates), and 저축은행 (savings) — each
 *   with distinct asset-class, LTV, size, and covenant preferences.
 *
 *   This module:
 *     1. Encodes ~15 archetype lender profiles with quantified parameters.
 *     2. Given a deal (asset class, size, LTV need, DSCR, location), scores
 *        fit and computes indicative pricing.
 *     3. Returns a ranked shortlist with "why this fits" + "why this might
 *        kick out" reasoning — the output the debt-capital team actually
 *        needs when pre-sounding a deal.
 *
 *   The profiles are baseline archetypes (not exact institution quotes).
 *   They're anchored to publicly-observed CRE lending behavior in KR through
 *   2024-2026 — real transactions, not fantasy spreads.
 */

// ---------------------------------------------------------------------------
// Lender taxonomy
// ---------------------------------------------------------------------------

export type LenderCategory =
  | 'COMMERCIAL_BANK' // 시중은행: KB, 신한, 우리, 하나, NH, IBK
  | 'INSURANCE' // 생보 / 손보: 삼성생명, 한화생명, 교보, 미래에셋
  | 'PENSION' // 국민연금, 사학연금, 공무원연금
  | 'SECURITIES' // 증권사 PF / 브릿지: 메리츠, NH, 하나증권
  | 'MEZZ_FUND' // 메자닌 전문 펀드
  | 'CAPITAL' // 캐피탈: 하나캐피탈, 신한캐피탈
  | 'SAVINGS_BANK' // 저축은행: SBI, OK
  | 'FOREIGN' // 외국계: 씨티, HSBC, 도이치, Aozora
  | 'NPL_FUND'; // NPL 매입 펀드 (Oaktree, MBK, 한앤코 등)

export type AssetClassFocus =
  | 'OFFICE'
  | 'RETAIL'
  | 'INDUSTRIAL'
  | 'MULTIFAMILY'
  | 'HOTEL'
  | 'DATA_CENTER'
  | 'LAND'
  | 'MIXED_USE';

export type DebtInstrumentType =
  | 'SENIOR_TERM'
  | 'MEZZANINE'
  | 'BRIDGE'
  | 'CONSTRUCTION'
  | 'ACQUISITION_MORTGAGE';

export type LenderProfile = {
  code: string;
  displayName: string;
  category: LenderCategory;
  /** Asset classes the lender will actively consider. */
  assetClassFocus: AssetClassFocus[];
  /** Instrument types offered. */
  instrumentTypes: DebtInstrumentType[];
  /** Min / max deal size the lender underwrites (KRW). */
  minDealKrw: number;
  maxDealKrw: number;
  /** Target LTV range this lender will lend INTO, not a cap. */
  targetLtvMinPct: number;
  targetLtvMaxPct: number;
  /** Minimum DSCR they'll accept at stabilization. */
  minDscr: number;
  /** Minimum debt yield they'll accept. */
  minDebtYieldPct: number;
  /** Base spread over COFIX / KOFR or equivalent (bps). */
  baseSpreadBps: number;
  /**
   * How much the spread flexes per pct-point of LTV above target midpoint.
   * Used for indicative pricing.
   */
  ltvSpreadPremiumBpsPerPct: number;
  /** Amortization preference. */
  amortizationStyle: 'INTEREST_ONLY' | 'PARTIAL_AMORT' | 'FULL_AMORT';
  /** Term range in years. */
  termMinYears: number;
  termMaxYears: number;
  /** Underwriting speed (weeks to close indicative). */
  underwritingWeeks: number;
  /**
   * Geographic preference. 'NATIONAL' = any KR, 'METRO' = 수도권 + 6 광역시,
   * 'SEOUL_PRIME' = 서울 핵심 구 only.
   */
  geographicPreference: 'NATIONAL' | 'METRO' | 'SEOUL_PRIME';
  /** Lender will consider deals below investment-grade tenant credit? */
  acceptsSubInvestmentGrade: boolean;
  notes: string;
};

// ---------------------------------------------------------------------------
// Lender catalog — baseline archetypes
// ---------------------------------------------------------------------------

export const DEFAULT_LENDER_CATALOG: LenderProfile[] = [
  {
    code: 'BANK_BIG4_SENIOR',
    displayName: '시중은행 Big 4 senior',
    category: 'COMMERCIAL_BANK',
    assetClassFocus: ['OFFICE', 'RETAIL', 'MULTIFAMILY', 'INDUSTRIAL', 'MIXED_USE'],
    instrumentTypes: ['SENIOR_TERM', 'ACQUISITION_MORTGAGE'],
    minDealKrw: 50_000_000_000,
    maxDealKrw: 1_500_000_000_000,
    targetLtvMinPct: 50,
    targetLtvMaxPct: 60,
    minDscr: 1.25,
    minDebtYieldPct: 8.0,
    baseSpreadBps: 180,
    ltvSpreadPremiumBpsPerPct: 12,
    amortizationStyle: 'PARTIAL_AMORT',
    termMinYears: 3,
    termMaxYears: 7,
    underwritingWeeks: 6,
    geographicPreference: 'NATIONAL',
    acceptsSubInvestmentGrade: false,
    notes: 'Conservative senior. Needs IG tenant or strong sponsor. LTV cap hard at 60%.'
  },
  {
    code: 'BANK_IBK_IND',
    displayName: '기업은행 산업용 담보대출',
    category: 'COMMERCIAL_BANK',
    assetClassFocus: ['INDUSTRIAL', 'MIXED_USE', 'DATA_CENTER'],
    instrumentTypes: ['SENIOR_TERM', 'CONSTRUCTION'],
    minDealKrw: 20_000_000_000,
    maxDealKrw: 400_000_000_000,
    targetLtvMinPct: 50,
    targetLtvMaxPct: 65,
    minDscr: 1.2,
    minDebtYieldPct: 7.5,
    baseSpreadBps: 200,
    ltvSpreadPremiumBpsPerPct: 14,
    amortizationStyle: 'PARTIAL_AMORT',
    termMinYears: 3,
    termMaxYears: 10,
    underwritingWeeks: 7,
    geographicPreference: 'NATIONAL',
    acceptsSubInvestmentGrade: true,
    notes: 'Policy-bank bias toward industrial / logistics. Takes DC under construction.'
  },
  {
    code: 'INS_LIFE_PRIME',
    displayName: '대형 생보사 prime office',
    category: 'INSURANCE',
    assetClassFocus: ['OFFICE', 'RETAIL', 'MULTIFAMILY'],
    instrumentTypes: ['SENIOR_TERM', 'ACQUISITION_MORTGAGE'],
    minDealKrw: 100_000_000_000,
    maxDealKrw: 2_000_000_000_000,
    targetLtvMinPct: 45,
    targetLtvMaxPct: 55,
    minDscr: 1.3,
    minDebtYieldPct: 8.5,
    baseSpreadBps: 150,
    ltvSpreadPremiumBpsPerPct: 10,
    amortizationStyle: 'INTEREST_ONLY',
    termMinYears: 5,
    termMaxYears: 15,
    underwritingWeeks: 10,
    geographicPreference: 'SEOUL_PRIME',
    acceptsSubInvestmentGrade: false,
    notes: 'Tightest pricing, longest term, slowest UW. Seoul CBD/GBD/YBD office only.'
  },
  {
    code: 'INS_NONLIFE_MIDMARKET',
    displayName: '손보사 mid-market CRE',
    category: 'INSURANCE',
    assetClassFocus: ['OFFICE', 'RETAIL', 'INDUSTRIAL', 'HOTEL'],
    instrumentTypes: ['SENIOR_TERM'],
    minDealKrw: 50_000_000_000,
    maxDealKrw: 500_000_000_000,
    targetLtvMinPct: 50,
    targetLtvMaxPct: 60,
    minDscr: 1.25,
    minDebtYieldPct: 8.0,
    baseSpreadBps: 175,
    ltvSpreadPremiumBpsPerPct: 11,
    amortizationStyle: 'PARTIAL_AMORT',
    termMinYears: 3,
    termMaxYears: 10,
    underwritingWeeks: 8,
    geographicPreference: 'METRO',
    acceptsSubInvestmentGrade: false,
    notes: 'Stepping into 6대 광역시 mid-size beyond Seoul.'
  },
  {
    code: 'PENSION_NPS_CORE',
    displayName: '국민연금 core plus 대출',
    category: 'PENSION',
    assetClassFocus: ['OFFICE', 'RETAIL', 'MULTIFAMILY', 'INDUSTRIAL'],
    instrumentTypes: ['SENIOR_TERM'],
    minDealKrw: 300_000_000_000,
    maxDealKrw: 3_000_000_000_000,
    targetLtvMinPct: 40,
    targetLtvMaxPct: 55,
    minDscr: 1.35,
    minDebtYieldPct: 9.0,
    baseSpreadBps: 130,
    ltvSpreadPremiumBpsPerPct: 8,
    amortizationStyle: 'INTEREST_ONLY',
    termMinYears: 7,
    termMaxYears: 15,
    underwritingWeeks: 16,
    geographicPreference: 'SEOUL_PRIME',
    acceptsSubInvestmentGrade: false,
    notes: 'Cheapest long-dated senior. Only interested in trophy assets.'
  },
  {
    code: 'SEC_BRIDGE',
    displayName: '증권사 bridge PF',
    category: 'SECURITIES',
    assetClassFocus: ['OFFICE', 'RETAIL', 'HOTEL', 'MIXED_USE', 'DATA_CENTER', 'LAND'],
    instrumentTypes: ['BRIDGE', 'CONSTRUCTION'],
    minDealKrw: 20_000_000_000,
    maxDealKrw: 800_000_000_000,
    targetLtvMinPct: 60,
    targetLtvMaxPct: 75,
    minDscr: 1.1,
    minDebtYieldPct: 6.5,
    baseSpreadBps: 500,
    ltvSpreadPremiumBpsPerPct: 25,
    amortizationStyle: 'INTEREST_ONLY',
    termMinYears: 1,
    termMaxYears: 3,
    underwritingWeeks: 3,
    geographicPreference: 'NATIONAL',
    acceptsSubInvestmentGrade: true,
    notes:
      'Fast but expensive. Take-out required within 2-3 years. Post-2022 tightening still in effect.'
  },
  {
    code: 'MEZZ_DOMESTIC',
    displayName: '국내 mezzanine fund',
    category: 'MEZZ_FUND',
    assetClassFocus: ['OFFICE', 'RETAIL', 'INDUSTRIAL', 'HOTEL', 'MULTIFAMILY', 'MIXED_USE'],
    instrumentTypes: ['MEZZANINE'],
    minDealKrw: 30_000_000_000,
    maxDealKrw: 400_000_000_000,
    targetLtvMinPct: 60,
    targetLtvMaxPct: 80,
    minDscr: 1.05,
    minDebtYieldPct: 6.0,
    baseSpreadBps: 700,
    ltvSpreadPremiumBpsPerPct: 30,
    amortizationStyle: 'INTEREST_ONLY',
    termMinYears: 3,
    termMaxYears: 7,
    underwritingWeeks: 8,
    geographicPreference: 'METRO',
    acceptsSubInvestmentGrade: true,
    notes: 'Fills 60-80% LTV gap behind senior. Target 10-13% IRR, often with PIK.'
  },
  {
    code: 'CAP_SHORT',
    displayName: '캐피탈사 단기 담보',
    category: 'CAPITAL',
    assetClassFocus: ['OFFICE', 'RETAIL', 'MULTIFAMILY', 'MIXED_USE', 'LAND'],
    instrumentTypes: ['BRIDGE', 'ACQUISITION_MORTGAGE'],
    minDealKrw: 5_000_000_000,
    maxDealKrw: 100_000_000_000,
    targetLtvMinPct: 55,
    targetLtvMaxPct: 70,
    minDscr: 1.1,
    minDebtYieldPct: 7.0,
    baseSpreadBps: 350,
    ltvSpreadPremiumBpsPerPct: 18,
    amortizationStyle: 'PARTIAL_AMORT',
    termMinYears: 1,
    termMaxYears: 5,
    underwritingWeeks: 4,
    geographicPreference: 'NATIONAL',
    acceptsSubInvestmentGrade: true,
    notes: 'Flexible on non-core regions. Smaller ticket.'
  },
  {
    code: 'SAVBANK_LOCAL',
    displayName: '저축은행 지역 담보대출',
    category: 'SAVINGS_BANK',
    assetClassFocus: ['RETAIL', 'MULTIFAMILY', 'MIXED_USE', 'LAND', 'HOTEL'],
    instrumentTypes: ['SENIOR_TERM', 'ACQUISITION_MORTGAGE'],
    minDealKrw: 2_000_000_000,
    maxDealKrw: 50_000_000_000,
    targetLtvMinPct: 55,
    targetLtvMaxPct: 70,
    minDscr: 1.1,
    minDebtYieldPct: 7.5,
    baseSpreadBps: 400,
    ltvSpreadPremiumBpsPerPct: 20,
    amortizationStyle: 'PARTIAL_AMORT',
    termMinYears: 1,
    termMaxYears: 5,
    underwritingWeeks: 3,
    geographicPreference: 'NATIONAL',
    acceptsSubInvestmentGrade: true,
    notes: 'Primary exit for sub-scale regional deals. Rising NPL concentration since 2023.'
  },
  {
    code: 'FGN_MORTGAGE',
    displayName: '외국계 은행 dollar-linked',
    category: 'FOREIGN',
    assetClassFocus: ['OFFICE', 'INDUSTRIAL', 'DATA_CENTER'],
    instrumentTypes: ['SENIOR_TERM', 'MEZZANINE'],
    minDealKrw: 150_000_000_000,
    maxDealKrw: 1_000_000_000_000,
    targetLtvMinPct: 45,
    targetLtvMaxPct: 60,
    minDscr: 1.3,
    minDebtYieldPct: 8.5,
    baseSpreadBps: 250,
    ltvSpreadPremiumBpsPerPct: 15,
    amortizationStyle: 'INTEREST_ONLY',
    termMinYears: 3,
    termMaxYears: 7,
    underwritingWeeks: 10,
    geographicPreference: 'SEOUL_PRIME',
    acceptsSubInvestmentGrade: false,
    notes:
      'USD-linked pricing, requires NDF hedge program. Primarily institutional-grade Seoul offices + prime logistics.'
  },
  {
    code: 'NPL_DISTRESS',
    displayName: 'NPL / distressed fund',
    category: 'NPL_FUND',
    assetClassFocus: ['OFFICE', 'RETAIL', 'INDUSTRIAL', 'HOTEL', 'MIXED_USE', 'LAND'],
    instrumentTypes: ['BRIDGE', 'ACQUISITION_MORTGAGE'],
    minDealKrw: 10_000_000_000,
    maxDealKrw: 500_000_000_000,
    targetLtvMinPct: 40,
    targetLtvMaxPct: 65,
    minDscr: 0.9,
    minDebtYieldPct: 5.0,
    baseSpreadBps: 900,
    ltvSpreadPremiumBpsPerPct: 30,
    amortizationStyle: 'INTEREST_ONLY',
    termMinYears: 1,
    termMaxYears: 4,
    underwritingWeeks: 4,
    geographicPreference: 'NATIONAL',
    acceptsSubInvestmentGrade: true,
    notes:
      'Last-resort rescue capital. Ruthless on covenants. Appropriate only for workout situations.'
  },
  {
    code: 'INS_DC_INFRA',
    displayName: '보험사 인프라 데이터센터 대출',
    category: 'INSURANCE',
    assetClassFocus: ['DATA_CENTER', 'INDUSTRIAL'],
    instrumentTypes: ['SENIOR_TERM', 'CONSTRUCTION'],
    minDealKrw: 200_000_000_000,
    maxDealKrw: 1_500_000_000_000,
    targetLtvMinPct: 50,
    targetLtvMaxPct: 62,
    minDscr: 1.25,
    minDebtYieldPct: 8.0,
    baseSpreadBps: 210,
    ltvSpreadPremiumBpsPerPct: 12,
    amortizationStyle: 'PARTIAL_AMORT',
    termMinYears: 5,
    termMaxYears: 12,
    underwritingWeeks: 12,
    geographicPreference: 'METRO',
    acceptsSubInvestmentGrade: false,
    notes:
      'Requires hyperscaler offtake LOI before drawing. DC-dedicated allocation growing 2025-2030.'
  },
  {
    code: 'PENSION_SATELLITE',
    displayName: '사학/공무원연금 mid-market',
    category: 'PENSION',
    assetClassFocus: ['OFFICE', 'RETAIL', 'MULTIFAMILY', 'INDUSTRIAL', 'HOTEL'],
    instrumentTypes: ['SENIOR_TERM'],
    minDealKrw: 80_000_000_000,
    maxDealKrw: 800_000_000_000,
    targetLtvMinPct: 45,
    targetLtvMaxPct: 58,
    minDscr: 1.3,
    minDebtYieldPct: 8.5,
    baseSpreadBps: 155,
    ltvSpreadPremiumBpsPerPct: 10,
    amortizationStyle: 'INTEREST_ONLY',
    termMinYears: 5,
    termMaxYears: 12,
    underwritingWeeks: 12,
    geographicPreference: 'METRO',
    acceptsSubInvestmentGrade: false,
    notes: 'Smaller tickets than NPS but similar pricing discipline.'
  },
  {
    code: 'SEC_CONSTRUCTION_PF',
    displayName: '증권사 준공 전 PF',
    category: 'SECURITIES',
    assetClassFocus: ['OFFICE', 'RETAIL', 'MULTIFAMILY', 'MIXED_USE', 'DATA_CENTER'],
    instrumentTypes: ['CONSTRUCTION'],
    minDealKrw: 50_000_000_000,
    maxDealKrw: 600_000_000_000,
    targetLtvMinPct: 55,
    targetLtvMaxPct: 75,
    minDscr: 0.0, // pre-stabilization, DSCR N/A
    minDebtYieldPct: 0.0,
    baseSpreadBps: 600,
    ltvSpreadPremiumBpsPerPct: 28,
    amortizationStyle: 'INTEREST_ONLY',
    termMinYears: 2,
    termMaxYears: 4,
    underwritingWeeks: 5,
    geographicPreference: 'NATIONAL',
    acceptsSubInvestmentGrade: true,
    notes: 'Construction-phase only. Take-out mandatory at CoO. Guarantors typically required.'
  },
  {
    code: 'FGN_OFFSHORE_FUND',
    displayName: 'Offshore CRE debt fund',
    category: 'FOREIGN',
    assetClassFocus: ['OFFICE', 'DATA_CENTER', 'INDUSTRIAL'],
    instrumentTypes: ['SENIOR_TERM', 'MEZZANINE', 'BRIDGE'],
    minDealKrw: 100_000_000_000,
    maxDealKrw: 800_000_000_000,
    targetLtvMinPct: 55,
    targetLtvMaxPct: 75,
    minDscr: 1.1,
    minDebtYieldPct: 7.0,
    baseSpreadBps: 450,
    ltvSpreadPremiumBpsPerPct: 22,
    amortizationStyle: 'INTEREST_ONLY',
    termMinYears: 2,
    termMaxYears: 5,
    underwritingWeeks: 6,
    geographicPreference: 'METRO',
    acceptsSubInvestmentGrade: true,
    notes: 'USD-linked. Aggressive on DC and logistics take-outs. Requires NDF or swap hedge.'
  }
];

// ---------------------------------------------------------------------------
// Deal profile + matching
// ---------------------------------------------------------------------------

export type DebtDealProfile = {
  assetClass: AssetClassFocus;
  stage: 'STABILIZED' | 'LIVE' | 'CONSTRUCTION' | 'BRIDGE' | 'LAND';
  totalDealSizeKrw: number;
  debtNeedKrw: number;
  /** Target LTV from sponsor perspective. */
  targetLtvPct: number;
  stabilizedDscr: number;
  stabilizedDebtYieldPct: number;
  province: string | null;
  district: string | null;
  instrumentPreference: DebtInstrumentType[];
  /** Tenant or sponsor credit profile. If sub-IG, many senior lenders will drop out. */
  tenantCreditIsInvestmentGrade: boolean;
  /** Weeks of underwriting runway available. Fast deals filter out slow lenders. */
  maxUnderwritingWeeks: number;
};

const PRIME_SEOUL_DISTRICTS = new Set([
  '강남구',
  '서초구',
  '송파구',
  '용산구',
  '영등포구',
  '중구',
  '종로구'
]);

const METRO_PROVINCES = new Set([
  '서울특별시',
  '경기도',
  '인천광역시',
  '부산광역시',
  '대구광역시',
  '광주광역시',
  '대전광역시',
  '울산광역시'
]);

function geoFit(profile: LenderProfile, deal: DebtDealProfile): number {
  const pref = profile.geographicPreference;
  if (pref === 'NATIONAL') return 1;
  const isMetro = deal.province ? METRO_PROVINCES.has(deal.province) : false;
  const isSeoulPrime =
    deal.province === '서울특별시' &&
    deal.district !== null &&
    PRIME_SEOUL_DISTRICTS.has(deal.district);
  if (pref === 'METRO') return isMetro ? 1 : 0.3;
  // SEOUL_PRIME
  return isSeoulPrime ? 1 : isMetro ? 0.4 : 0.1;
}

function stageMatchesInstrument(
  profileInstruments: DebtInstrumentType[],
  dealStage: DebtDealProfile['stage']
): boolean {
  // Pre-stabilization stages want bridge/construction instruments.
  if (dealStage === 'CONSTRUCTION') return profileInstruments.includes('CONSTRUCTION');
  if (dealStage === 'BRIDGE') return profileInstruments.includes('BRIDGE');
  if (dealStage === 'LAND')
    return (
      profileInstruments.includes('BRIDGE') || profileInstruments.includes('ACQUISITION_MORTGAGE')
    );
  // Operating / stabilized: senior term or acquisition mortgage.
  return (
    profileInstruments.includes('SENIOR_TERM') ||
    profileInstruments.includes('ACQUISITION_MORTGAGE') ||
    profileInstruments.includes('MEZZANINE')
  );
}

// ---------------------------------------------------------------------------
// Score + pricing
// ---------------------------------------------------------------------------

export type LenderMatchDetail = {
  lender: LenderProfile;
  /** 0-100; higher = better fit. Scenarios <40 are practically not viable. */
  fitScore: number;
  eligible: boolean;
  /** Per-axis pass/fail so operator can see why. */
  checks: {
    assetClass: boolean;
    instrument: boolean;
    dealSize: boolean;
    ltv: boolean;
    dscr: boolean;
    debtYield: boolean;
    credit: boolean;
    underwritingSpeed: boolean;
    geographic: boolean;
  };
  /** If eligible: indicative pricing. */
  indicativeSpreadBps: number | null;
  indicativeAllInRatePct: number | null;
  indicativeAmortizationStyle: LenderProfile['amortizationStyle'] | null;
  indicativeTermYears: number | null;
  reasons: string[];
};

export type DebtSourcingResult = {
  shortlist: LenderMatchDetail[];
  eligibleCount: number;
  recommendedTopN: LenderMatchDetail[];
  fallbackRationale: string | null;
};

function computeIndicativeSpread(profile: LenderProfile, deal: DebtDealProfile): number {
  const midLtv = (profile.targetLtvMinPct + profile.targetLtvMaxPct) / 2;
  const ltvDelta = Math.max(0, deal.targetLtvPct - midLtv);
  return profile.baseSpreadBps + ltvDelta * profile.ltvSpreadPremiumBpsPerPct;
}

/**
 * Base floating-rate benchmark to convert spread → all-in rate. For senior
 * 3-year KR commercial debt, COFIX ~ 3.6% mid-2026. Callers can override.
 */
const BENCHMARK_KRW_FLOATING_PCT = 3.6;

export function evaluateLender(
  profile: LenderProfile,
  deal: DebtDealProfile,
  benchmarkRatePct = BENCHMARK_KRW_FLOATING_PCT
): LenderMatchDetail {
  const reasons: string[] = [];

  const assetClassOk = profile.assetClassFocus.includes(deal.assetClass);
  if (!assetClassOk) reasons.push(`Asset class ${deal.assetClass} outside focus`);

  // Instrument eligibility is driven by deal stage. Sponsor's instrumentPreference
  // is a soft tie-breaker later — for example a SENIOR_TERM preference should not
  // hard-exclude an ACQUISITION_MORTGAGE lender since they are fungible for an
  // existing-asset acquisition in KR.
  const instrumentOk = stageMatchesInstrument(profile.instrumentTypes, deal.stage);
  const prefAligned =
    deal.instrumentPreference.length === 0 ||
    deal.instrumentPreference.some((i) => profile.instrumentTypes.includes(i));
  if (!instrumentOk) reasons.push(`Instrument mismatch vs ${deal.stage} stage`);
  else if (!prefAligned)
    reasons.push(`Lender instrument set outside sponsor preference (soft flag)`);

  const dealSizeOk =
    deal.debtNeedKrw >= profile.minDealKrw && deal.debtNeedKrw <= profile.maxDealKrw;
  if (!dealSizeOk) {
    if (deal.debtNeedKrw < profile.minDealKrw) reasons.push('Below minimum deal size');
    else reasons.push('Above maximum deal size');
  }

  const ltvOk = deal.targetLtvPct <= profile.targetLtvMaxPct;
  if (!ltvOk)
    reasons.push(`LTV ${deal.targetLtvPct}% exceeds lender cap ${profile.targetLtvMaxPct}%`);

  // DSCR / debt-yield checks only apply to stabilized-income instruments.
  const needsIncomeTest = deal.stage === 'STABILIZED' || deal.stage === 'LIVE';
  const dscrOk = !needsIncomeTest || deal.stabilizedDscr >= profile.minDscr;
  if (!dscrOk)
    reasons.push(`DSCR ${deal.stabilizedDscr.toFixed(2)}× below floor ${profile.minDscr}×`);
  const debtYieldOk = !needsIncomeTest || deal.stabilizedDebtYieldPct >= profile.minDebtYieldPct;
  if (!debtYieldOk)
    reasons.push(
      `Debt yield ${deal.stabilizedDebtYieldPct}% below floor ${profile.minDebtYieldPct}%`
    );

  const creditOk = deal.tenantCreditIsInvestmentGrade || profile.acceptsSubInvestmentGrade;
  if (!creditOk) reasons.push('Lender requires investment-grade tenant/sponsor');

  const speedOk = profile.underwritingWeeks <= deal.maxUnderwritingWeeks;
  if (!speedOk)
    reasons.push(
      `Underwriting ${profile.underwritingWeeks}w > runway ${deal.maxUnderwritingWeeks}w`
    );

  const geoScore = geoFit(profile, deal);
  const geoOk = geoScore >= 0.3;
  if (!geoOk) reasons.push('Geography outside lender mandate');

  const checks = {
    assetClass: assetClassOk,
    instrument: instrumentOk,
    dealSize: dealSizeOk,
    ltv: ltvOk,
    dscr: dscrOk,
    debtYield: debtYieldOk,
    credit: creditOk,
    underwritingSpeed: speedOk,
    geographic: geoOk
  };

  const eligible = Object.values(checks).every((v) => v);
  // fit score: 100 base minus penalties per failed check.
  const penalties: Record<keyof typeof checks, number> = {
    assetClass: 40,
    instrument: 40,
    dealSize: 30,
    ltv: 25,
    dscr: 20,
    debtYield: 20,
    credit: 25,
    underwritingSpeed: 15,
    geographic: 15
  };
  let score = 100;
  for (const key of Object.keys(checks) as Array<keyof typeof checks>) {
    if (!checks[key]) score -= penalties[key];
  }
  if (instrumentOk && !prefAligned) score -= 10; // soft preference penalty
  score = Math.max(0, score);
  // Geographic tilt even when "ok" — Seoul-prime geo worth a small bonus for prime-only lenders.
  score = score * (0.6 + 0.4 * geoScore);

  let indicativeSpread: number | null = null;
  let indicativeAllIn: number | null = null;
  let indicativeAmort: LenderProfile['amortizationStyle'] | null = null;
  let indicativeTerm: number | null = null;
  if (eligible) {
    indicativeSpread = computeIndicativeSpread(profile, deal);
    indicativeAllIn = Number((benchmarkRatePct + indicativeSpread / 100).toFixed(3));
    indicativeAmort = profile.amortizationStyle;
    indicativeTerm = profile.termMaxYears;
    reasons.push(
      `Indicative ${indicativeAllIn}% all-in (${indicativeSpread}bps over ${benchmarkRatePct}% benchmark), ${profile.termMinYears}-${profile.termMaxYears}y term.`
    );
  }

  return {
    lender: profile,
    fitScore: Math.round(score),
    eligible,
    checks,
    indicativeSpreadBps: indicativeSpread === null ? null : Math.round(indicativeSpread),
    indicativeAllInRatePct: indicativeAllIn,
    indicativeAmortizationStyle: indicativeAmort,
    indicativeTermYears: indicativeTerm,
    reasons
  };
}

export function sourceDebt(
  deal: DebtDealProfile,
  catalog: LenderProfile[] = DEFAULT_LENDER_CATALOG,
  topN = 5,
  benchmarkRatePct = BENCHMARK_KRW_FLOATING_PCT
): DebtSourcingResult {
  const details = catalog
    .map((p) => evaluateLender(p, deal, benchmarkRatePct))
    .sort((a, b) => {
      // Eligible first, then fit score, then cheaper indicative spread.
      if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
      if (b.fitScore !== a.fitScore) return b.fitScore - a.fitScore;
      const aSpread = a.indicativeSpreadBps ?? Number.POSITIVE_INFINITY;
      const bSpread = b.indicativeSpreadBps ?? Number.POSITIVE_INFINITY;
      return aSpread - bSpread;
    });

  const eligible = details.filter((d) => d.eligible);
  const recommendedTopN = eligible.slice(0, topN);

  let fallbackRationale: string | null = null;
  if (eligible.length === 0) {
    const closest = details[0];
    if (closest) {
      const failing = Object.entries(closest.checks)
        .filter(([, ok]) => !ok)
        .map(([k]) => k);
      fallbackRationale = `No eligible lender. Closest: ${closest.lender.displayName} (failed: ${failing.join(', ')}). Consider restructuring: lower LTV, add credit enhancement, or shift instrument.`;
    } else {
      fallbackRationale = 'No lenders in catalog.';
    }
  } else if (eligible.length < 3) {
    fallbackRationale = `Only ${eligible.length} eligible lender(s) — thin coverage, consider covenant flexibility or larger syndication.`;
  }

  return {
    shortlist: details,
    eligibleCount: eligible.length,
    recommendedTopN,
    fallbackRationale
  };
}
