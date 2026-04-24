/**
 * Tenant credit engine — converts corporate financial statements into a
 * rating grade and rent-default projection that the valuation stack can use
 * to haircut gross rent.
 *
 * Why this exists:
 *   Rent is only as safe as the tenant paying it. Korean CRE underwriting
 *   today usually assumes a flat vacancy / credit-loss reserve (e.g. "3%")
 *   regardless of which tenants actually occupy the building. A Samsung
 *   Electronics lease and a small F&B operator are not the same risk, and
 *   the cap-rate the market will pay reflects that difference.
 *
 *   This module:
 *     1. Parses a DART-style financial statement snapshot (balance sheet +
 *        income + cash flow) into normalized ratios.
 *     2. Scores those ratios with a Korean-methodology-anchored point system
 *        (KED / NICE / 한신평 style weights) and assigns a letter grade.
 *     3. Maps grade → 1-year probability of default using a calibrated curve
 *        consistent with historical Korean corporate default data.
 *     4. Aggregates a rent roll's tenant mix into an expected rent-loss
 *        figure (rent × PD × LGD), where LGD is set low because KR leases
 *        are backed by a 10-month security deposit (보증금).
 *
 *   The financials themselves are the caller's responsibility — this module
 *   does not fetch from DART. A separate connector handles that.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CreditGrade = 'AAA' | 'AA' | 'A' | 'BBB' | 'BB' | 'B' | 'CCC';

export type IndustrySector =
  | 'FINANCE'
  | 'TECH'
  | 'MANUFACTURING'
  | 'RETAIL'
  | 'LOGISTICS'
  | 'HEALTHCARE'
  | 'F_AND_B'
  | 'CONSTRUCTION'
  | 'GENERAL';

export type TenantFinancials = {
  companyId: string;
  companyName: string;
  industry: IndustrySector;
  fiscalYear: number;
  isListed: boolean;
  totalAssetsKrw: number;
  totalLiabilitiesKrw: number;
  currentAssetsKrw: number;
  currentLiabilitiesKrw: number;
  cashAndEquivalentsKrw: number;
  totalDebtKrw: number;
  revenueKrw: number;
  operatingIncomeKrw: number;
  netIncomeKrw: number;
  interestExpenseKrw: number;
  operatingCashFlowKrw: number;
  priorYearRevenueKrw?: number;
};

export type CreditRatios = {
  currentRatio: number;
  debtToEquityPct: number;
  equityRatioPct: number;
  interestCoverage: number | null;
  operatingMarginPct: number;
  netMarginPct: number;
  revenueGrowthPct: number | null;
  ocfToDebtPct: number | null;
  roaPct: number;
  cashToDebtPct: number | null;
};

export type CreditAssessment = {
  companyId: string;
  companyName: string;
  industry: IndustrySector;
  grade: CreditGrade;
  numericScore: number;
  oneYearPdPct: number;
  ratios: CreditRatios;
  strengths: string[];
  weaknesses: string[];
  watchFlags: string[];
  isInvestmentGrade: boolean;
};

export type TenantExposure = {
  tenant: TenantFinancials;
  annualRentKrw: number;
  leaseRemainingYears: number;
};

export type RentDefaultProjection = {
  totalAnnualRentKrw: number;
  weightedPd1yrPct: number;
  weightedGrade: CreditGrade;
  expectedAnnualRentLossKrw: number;
  adjustedAnnualRentKrw: number;
  effectiveCreditReservePct: number;
  breakdown: Array<{
    companyName: string;
    grade: CreditGrade;
    annualRentKrw: number;
    pd1yrPct: number;
    expectedAnnualLossKrw: number;
  }>;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Loss-Given-Default on a KR commercial-rent default.
 *
 * KR commercial leases require a 보증금 (security deposit) equal to roughly
 * 10 months of rent. On default, a landlord applies that deposit against
 * rent arrears and ejectment costs. Empirically, the deposit covers most
 * of the gap before a replacement tenant is signed. 25% is a conservative
 * residual loss rate. Overrideable per asset.
 */
export const DEFAULT_LGD_PCT = 25;

const GRADE_PD_CURVE: Record<CreditGrade, number> = {
  AAA: 0.01,
  AA: 0.08,
  A: 0.25,
  BBB: 0.80,
  BB: 3.5,
  B: 10.0,
  CCC: 28.0
};

const INDUSTRY_SCORE_ADJ: Record<IndustrySector, number> = {
  FINANCE: 2,
  TECH: 2,
  HEALTHCARE: 2,
  MANUFACTURING: 0,
  LOGISTICS: 0,
  GENERAL: 0,
  RETAIL: -3,
  F_AND_B: -5,
  CONSTRUCTION: -5
};

// ---------------------------------------------------------------------------
// Ratio computation
// ---------------------------------------------------------------------------

function safeDiv(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(denominator) || denominator === 0) return null;
  return numerator / denominator;
}

export function computeRatios(f: TenantFinancials): CreditRatios {
  const equityKrw = f.totalAssetsKrw - f.totalLiabilitiesKrw;
  const currentRatio = safeDiv(f.currentAssetsKrw, f.currentLiabilitiesKrw) ?? 0;
  const debtToEquityPct = equityKrw > 0 ? (f.totalLiabilitiesKrw / equityKrw) * 100 : 9999;
  const equityRatioPct = f.totalAssetsKrw > 0 ? (equityKrw / f.totalAssetsKrw) * 100 : 0;
  const interestCoverage =
    f.interestExpenseKrw > 0 ? f.operatingIncomeKrw / f.interestExpenseKrw : null;
  const operatingMarginPct = f.revenueKrw > 0 ? (f.operatingIncomeKrw / f.revenueKrw) * 100 : 0;
  const netMarginPct = f.revenueKrw > 0 ? (f.netIncomeKrw / f.revenueKrw) * 100 : 0;
  const revenueGrowthPct =
    f.priorYearRevenueKrw && f.priorYearRevenueKrw > 0
      ? ((f.revenueKrw - f.priorYearRevenueKrw) / f.priorYearRevenueKrw) * 100
      : null;
  const ocfToDebtPct = f.totalDebtKrw > 0 ? (f.operatingCashFlowKrw / f.totalDebtKrw) * 100 : null;
  const roaPct = f.totalAssetsKrw > 0 ? (f.netIncomeKrw / f.totalAssetsKrw) * 100 : 0;
  const cashToDebtPct =
    f.totalDebtKrw > 0 ? (f.cashAndEquivalentsKrw / f.totalDebtKrw) * 100 : null;

  return {
    currentRatio,
    debtToEquityPct,
    equityRatioPct,
    interestCoverage,
    operatingMarginPct,
    netMarginPct,
    revenueGrowthPct,
    ocfToDebtPct,
    roaPct,
    cashToDebtPct
  };
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

function scoreCurrentRatio(v: number): number {
  if (v >= 1.5) return 20;
  if (v >= 1.2) return 15;
  if (v >= 1.0) return 10;
  if (v >= 0.8) return 3;
  if (v >= 0.5) return 0;
  return -5;
}

function scoreDebtToEquity(v: number): number {
  if (v < 100) return 15;
  if (v < 200) return 10;
  if (v < 300) return 5;
  if (v < 400) return 0;
  return -10;
}

function scoreInterestCoverage(v: number | null): number {
  if (v === null) return 10; // no debt → treat as strong
  if (v >= 5) return 15;
  if (v >= 3) return 12;
  if (v >= 1.5) return 8;
  if (v >= 1) return 3;
  return -10;
}

function scoreOperatingMargin(v: number): number {
  if (v >= 15) return 15;
  if (v >= 10) return 12;
  if (v >= 5) return 8;
  if (v >= 2) return 5;
  if (v >= 0) return 3;
  return -10;
}

function scoreRevenueGrowth(v: number | null): number {
  if (v === null) return 4; // no prior-year data → neutral
  if (v >= 10) return 10;
  if (v >= 3) return 7;
  if (v >= -5) return 4;
  if (v >= -15) return 0;
  return -5;
}

function scoreOcfToDebt(v: number | null): number {
  if (v === null) return 7; // no interest-bearing debt → neutral-positive
  if (v >= 25) return 10;
  if (v >= 15) return 7;
  if (v >= 5) return 4;
  if (v >= 0) return 1;
  return -5;
}

function scoreRoa(v: number): number {
  if (v >= 7) return 10;
  if (v >= 3) return 7;
  if (v >= 1) return 4;
  if (v >= 0) return 2;
  return -5;
}

function gradeFromScore(score: number): CreditGrade {
  if (score >= 85) return 'AAA';
  if (score >= 72) return 'AA';
  if (score >= 60) return 'A';
  if (score >= 48) return 'BBB';
  if (score >= 36) return 'BB';
  if (score >= 22) return 'B';
  return 'CCC';
}

function collectStrengths(r: CreditRatios): string[] {
  const s: string[] = [];
  if (r.currentRatio >= 1.5) s.push(`유동비율 ${r.currentRatio.toFixed(2)} (strong liquidity)`);
  if (r.debtToEquityPct < 100) s.push(`부채비율 ${r.debtToEquityPct.toFixed(0)}% (low leverage)`);
  if (r.interestCoverage !== null && r.interestCoverage >= 5)
    s.push(`이자보상배율 ${r.interestCoverage.toFixed(1)}x (strong coverage)`);
  if (r.operatingMarginPct >= 15)
    s.push(`영업이익률 ${r.operatingMarginPct.toFixed(1)}% (high margin)`);
  if (r.revenueGrowthPct !== null && r.revenueGrowthPct >= 10)
    s.push(`매출성장률 ${r.revenueGrowthPct.toFixed(1)}% (double-digit growth)`);
  if (r.roaPct >= 7) s.push(`ROA ${r.roaPct.toFixed(1)}% (efficient asset use)`);
  return s;
}

function collectWeaknesses(r: CreditRatios): string[] {
  const w: string[] = [];
  if (r.currentRatio < 1.0) w.push(`유동비율 ${r.currentRatio.toFixed(2)} below 1.0`);
  if (r.debtToEquityPct >= 300)
    w.push(`부채비율 ${r.debtToEquityPct.toFixed(0)}% (over-leveraged)`);
  if (r.interestCoverage !== null && r.interestCoverage < 1.5)
    w.push(`이자보상배율 ${r.interestCoverage.toFixed(2)}x (thin coverage)`);
  if (r.operatingMarginPct < 2)
    w.push(`영업이익률 ${r.operatingMarginPct.toFixed(1)}% (weak profitability)`);
  if (r.revenueGrowthPct !== null && r.revenueGrowthPct < -5)
    w.push(`매출성장률 ${r.revenueGrowthPct.toFixed(1)}% (contracting)`);
  if (r.ocfToDebtPct !== null && r.ocfToDebtPct < 5)
    w.push(`OCF/Debt ${r.ocfToDebtPct.toFixed(1)}% (cashflow stress)`);
  return w;
}

function collectWatchFlags(f: TenantFinancials, r: CreditRatios): string[] {
  const flags: string[] = [];
  if (f.operatingIncomeKrw < 0) flags.push('Negative operating income');
  if (f.netIncomeKrw < 0) flags.push('Net loss');
  if (r.interestCoverage !== null && r.interestCoverage < 1)
    flags.push('Interest coverage below 1.0x — 한계기업 risk');
  if (r.debtToEquityPct >= 400) flags.push('부채비율 >= 400% (distressed leverage)');
  if (r.currentRatio < 0.8) flags.push('Current ratio < 0.8 (near-term liquidity squeeze)');
  if (f.operatingCashFlowKrw < 0) flags.push('Negative operating cash flow');
  if (r.revenueGrowthPct !== null && r.revenueGrowthPct < -15)
    flags.push('Revenue decline > 15% YoY');
  return flags;
}

export function assessCredit(f: TenantFinancials): CreditAssessment {
  const ratios = computeRatios(f);
  const rawScore =
    scoreCurrentRatio(ratios.currentRatio) +
    scoreDebtToEquity(ratios.debtToEquityPct) +
    scoreInterestCoverage(ratios.interestCoverage) +
    scoreOperatingMargin(ratios.operatingMarginPct) +
    scoreRevenueGrowth(ratios.revenueGrowthPct) +
    scoreOcfToDebt(ratios.ocfToDebtPct) +
    scoreRoa(ratios.roaPct);
  const listedBonus = f.isListed ? 5 : 0;
  const industryAdj = INDUSTRY_SCORE_ADJ[f.industry];
  const numericScore = Math.max(0, Math.min(100, rawScore + listedBonus + industryAdj));
  const grade = gradeFromScore(numericScore);
  const oneYearPdPct = GRADE_PD_CURVE[grade];

  return {
    companyId: f.companyId,
    companyName: f.companyName,
    industry: f.industry,
    grade,
    numericScore,
    oneYearPdPct,
    ratios,
    strengths: collectStrengths(ratios),
    weaknesses: collectWeaknesses(ratios),
    watchFlags: collectWatchFlags(f, ratios),
    isInvestmentGrade: ['AAA', 'AA', 'A', 'BBB'].includes(grade)
  };
}

// ---------------------------------------------------------------------------
// Rent-default projection
// ---------------------------------------------------------------------------

export function projectRentDefault(
  exposures: TenantExposure[],
  lgdPct: number = DEFAULT_LGD_PCT
): RentDefaultProjection {
  const totalAnnualRentKrw = exposures.reduce((sum, e) => sum + e.annualRentKrw, 0);
  const breakdown = exposures.map((e) => {
    const assessment = assessCredit(e.tenant);
    const expectedAnnualLossKrw =
      (e.annualRentKrw * assessment.oneYearPdPct * lgdPct) / (100 * 100);
    return {
      companyName: e.tenant.companyName,
      grade: assessment.grade,
      annualRentKrw: e.annualRentKrw,
      pd1yrPct: assessment.oneYearPdPct,
      expectedAnnualLossKrw
    };
  });
  const expectedAnnualRentLossKrw = breakdown.reduce(
    (sum, b) => sum + b.expectedAnnualLossKrw,
    0
  );
  const weightedPd1yrPct =
    totalAnnualRentKrw > 0
      ? breakdown.reduce((sum, b) => sum + b.pd1yrPct * b.annualRentKrw, 0) / totalAnnualRentKrw
      : 0;
  const weightedGrade = gradeFromPd(weightedPd1yrPct);
  const adjustedAnnualRentKrw = totalAnnualRentKrw - expectedAnnualRentLossKrw;
  const effectiveCreditReservePct =
    totalAnnualRentKrw > 0 ? (expectedAnnualRentLossKrw / totalAnnualRentKrw) * 100 : 0;

  return {
    totalAnnualRentKrw,
    weightedPd1yrPct,
    weightedGrade,
    expectedAnnualRentLossKrw,
    adjustedAnnualRentKrw,
    effectiveCreditReservePct,
    breakdown
  };
}

function gradeFromPd(pdPct: number): CreditGrade {
  if (pdPct <= 0.03) return 'AAA';
  if (pdPct <= 0.15) return 'AA';
  if (pdPct <= 0.5) return 'A';
  if (pdPct <= 1.5) return 'BBB';
  if (pdPct <= 6) return 'BB';
  if (pdPct <= 18) return 'B';
  return 'CCC';
}

export { GRADE_PD_CURVE, INDUSTRY_SCORE_ADJ, gradeFromScore, gradeFromPd };
