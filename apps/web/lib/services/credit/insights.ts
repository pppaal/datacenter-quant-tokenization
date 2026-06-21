/**
 * Multi-period credit insights — the cross-period derivations the single-period
 * scorers (tenant-credit, credit-analysis, buildCreditAssessmentFromStatement)
 * don't do. All pure / unit-testable; callers coerce Decimal at the boundary.
 *
 * Includes the corrected 한계기업 (marginal-firm) test: the KR/BOK definition is
 * 이자보상배율(ICR) < 1.0 for THREE consecutive years — not a single sub-1.0 year
 * (which the old per-statement flag mislabeled).
 */
import { toNumberOrNull, round } from '@/lib/math';
import type { CreditGrade } from '@/lib/services/valuation/tenant-credit';

// ---------------------------------------------------------------------------
// 한계기업 (marginal firm): ICR < 1.0 for 3 consecutive (most-recent) years
// ---------------------------------------------------------------------------

export type MarginalFirmInput = {
  fiscalYear: number | null;
  operatingIncomeKrw: unknown;
  interestExpenseKrw: unknown;
};

export type MarginalFirmResult = {
  isMarginalFirm: boolean;
  /** Length of the trailing run of consecutive ICR<1 years. */
  consecutiveSubOneYears: number;
  icrByYear: { year: number; icr: number | null }[];
  label: string;
};

export function detectMarginalFirm(statements: MarginalFirmInput[]): MarginalFirmResult {
  // One ICR per fiscal year (latest filing per year wins), ascending by year.
  const byYear = new Map<number, number | null>();
  for (const s of statements) {
    if (s.fiscalYear == null) continue;
    const op = toNumberOrNull(s.operatingIncomeKrw);
    const int = toNumberOrNull(s.interestExpenseKrw);
    // ICR is undefined without positive interest expense → null (breaks the run).
    const icr = op !== null && int !== null && int > 0 ? round(op / int, 2) : null;
    byYear.set(s.fiscalYear, icr);
  }
  const icrByYear = [...byYear.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, icr]) => ({ year, icr }));

  // Count the trailing run of consecutive years with a defined ICR < 1.0.
  let run = 0;
  for (let i = icrByYear.length - 1; i >= 0; i -= 1) {
    const icr = icrByYear[i].icr;
    if (icr !== null && icr < 1) run += 1;
    else break;
  }
  const isMarginalFirm = run >= 3;
  const label = isMarginalFirm
    ? `한계기업 — 이자보상배율 ${run}년 연속 1.0 미만`
    : run > 0
      ? `이자보상배율 ${run}년 1.0 미만 (한계기업 아님)`
      : '이자보상배율 1.0 이상';
  return { isMarginalFirm, consecutiveSubOneYears: run, icrByYear, label };
}

// ---------------------------------------------------------------------------
// YoY trend deterioration / improvement
// ---------------------------------------------------------------------------

export type CreditTrendPeriod = {
  fiscalYear: number | null;
  debtToEquityPct?: number | null; // 부채비율 (%)
  interestCoverage?: number | null; // 이자보상배율 (x)
  operatingMarginPct?: number | null; // 영업이익률 (%)
  revenueKrw?: number | null;
  currentRatio?: number | null; // 유동비율 (x)
};

export type CreditTrendResult = {
  deteriorating: string[];
  improving: string[];
  /** Hard band breaches (정책 임계 돌파) regardless of magnitude. */
  flags: string[];
};

export function computeCreditTrend(periods: CreditTrendPeriod[]): CreditTrendResult {
  const sorted = [...periods]
    .filter((p) => p.fiscalYear != null)
    .sort((a, b) => a.fiscalYear! - b.fiscalYear!);
  const out: CreditTrendResult = { deteriorating: [], improving: [], flags: [] };
  if (sorted.length < 2) return out;
  const cur = sorted[sorted.length - 1];
  const prev = sorted[sorted.length - 2];

  const rel = (c: number, p: number) => (p !== 0 ? (c - p) / Math.abs(p) : 0);

  // 부채비율 (lower better)
  if (cur.debtToEquityPct != null && prev.debtToEquityPct != null) {
    const ch = rel(cur.debtToEquityPct, prev.debtToEquityPct);
    if (ch >= 0.15)
      out.deteriorating.push(
        `부채비율 상승 (${Math.round(prev.debtToEquityPct)}% → ${Math.round(cur.debtToEquityPct)}%)`
      );
    else if (ch <= -0.15)
      out.improving.push(
        `부채비율 개선 (${Math.round(prev.debtToEquityPct)}% → ${Math.round(cur.debtToEquityPct)}%)`
      );
    if (prev.debtToEquityPct < 200 && cur.debtToEquityPct >= 200)
      out.flags.push('부채비율 200% 돌파');
  }
  // 이자보상배율 (higher better)
  if (cur.interestCoverage != null && prev.interestCoverage != null) {
    const ch = rel(cur.interestCoverage, prev.interestCoverage);
    if (ch <= -0.25)
      out.deteriorating.push(
        `이자보상배율 급락 (${prev.interestCoverage.toFixed(1)}x → ${cur.interestCoverage.toFixed(1)}x)`
      );
    else if (ch >= 0.25)
      out.improving.push(
        `이자보상배율 개선 (${prev.interestCoverage.toFixed(1)}x → ${cur.interestCoverage.toFixed(1)}x)`
      );
    if (prev.interestCoverage >= 1 && cur.interestCoverage < 1)
      out.flags.push('이자보상배율 1.0 미만 진입');
  }
  // 영업이익률 (higher better) — flag ≥2pp compression
  if (cur.operatingMarginPct != null && prev.operatingMarginPct != null) {
    const d = cur.operatingMarginPct - prev.operatingMarginPct;
    if (d <= -2)
      out.deteriorating.push(
        `영업이익률 압축 (${prev.operatingMarginPct.toFixed(1)}% → ${cur.operatingMarginPct.toFixed(1)}%)`
      );
    else if (d >= 2)
      out.improving.push(
        `영업이익률 확대 (${prev.operatingMarginPct.toFixed(1)}% → ${cur.operatingMarginPct.toFixed(1)}%)`
      );
  }
  // 매출 역성장
  if (
    cur.revenueKrw != null &&
    prev.revenueKrw != null &&
    prev.revenueKrw > 0 &&
    cur.revenueKrw < prev.revenueKrw
  ) {
    out.deteriorating.push(
      `매출 역성장 (${Math.round(rel(cur.revenueKrw, prev.revenueKrw) * 100)}%)`
    );
  }
  return out;
}

// ---------------------------------------------------------------------------
// Grade → implied credit spread (bps)
// ---------------------------------------------------------------------------

/** KR-corporate indicative credit spread over the risk-free benchmark, by grade. */
const GRADE_SPREAD_BPS: Record<CreditGrade, number> = {
  AAA: 30,
  AA: 55,
  A: 95,
  BBB: 150,
  BB: 400,
  B: 650,
  CCC: 950
};

export function gradeToSpreadBps(grade: CreditGrade): { spreadBps: number; rationale: string } {
  const spreadBps = GRADE_SPREAD_BPS[grade];
  return {
    spreadBps,
    rationale: `${grade} 등급 ⇒ 무위험 대비 약 ${spreadBps}bps 크레딧 스프레드 (지표성). 임대료/캡레이트 할인의 사후검증 기준.`
  };
}

// ---------------------------------------------------------------------------
// Financial-statement staleness
// ---------------------------------------------------------------------------

export type FinancialFreshness = {
  ageMonths: number | null;
  staleness: 'CURRENT' | 'AGING' | 'STALE' | 'UNKNOWN';
  flag: string | null;
};

export function assessFinancialFreshness(input: {
  periodEndDate?: Date | string | null;
  fiscalYear?: number | null;
  asOf?: Date;
}): FinancialFreshness {
  const asOf = input.asOf ?? new Date();
  let end: Date | null = null;
  if (input.periodEndDate) {
    const d =
      input.periodEndDate instanceof Date ? input.periodEndDate : new Date(input.periodEndDate);
    if (!Number.isNaN(d.getTime())) end = d;
  }
  if (!end && input.fiscalYear) end = new Date(Date.UTC(input.fiscalYear, 11, 31));
  if (!end) return { ageMonths: null, staleness: 'UNKNOWN', flag: '재무제표 기준일 불명' };

  const ageMonths = Math.max(
    0,
    Math.round(((asOf.getTime() - end.getTime()) / (1000 * 60 * 60 * 24 * 30.4375)) * 10) / 10
  );
  if (ageMonths <= 15) return { ageMonths, staleness: 'CURRENT', flag: null };
  if (ageMonths <= 27)
    return {
      ageMonths,
      staleness: 'AGING',
      flag: `재무제표 ${Math.round(ageMonths)}개월 경과 (확인 필요)`
    };
  return {
    ageMonths,
    staleness: 'STALE',
    flag: `재무제표 ${Math.round(ageMonths)}개월 경과 — STALE`
  };
}

// ---------------------------------------------------------------------------
// Peer positioning narrative
// ---------------------------------------------------------------------------

const RATIO_KO: Record<string, string> = {
  leverage: '레버리지',
  netLeverage: '순레버리지',
  interestCoverage: '이자보상배율',
  debtToEquity: '부채비율',
  cashToDebt: '현금/부채',
  ebitdaMargin: 'EBITDA 마진',
  roeProxy: 'ROE',
  roaProxy: 'ROA',
  currentRatio: '유동비율'
};

export type PeerPositioning = {
  worstQuartileRatios: string[];
  topQuartileRatios: string[];
  headline: string | null;
};

export function summarizePeerPositioning(
  comparisons: { ratioKey: string; band: 'top' | 'mid' | 'bottom' | null }[]
): PeerPositioning {
  const label = (k: string) => RATIO_KO[k] ?? k;
  const worst = comparisons.filter((c) => c.band === 'bottom').map((c) => label(c.ratioKey));
  const top = comparisons.filter((c) => c.band === 'top').map((c) => label(c.ratioKey));
  let headline: string | null = null;
  if (worst.length > 0) {
    headline = `피어 대비 ${worst.length}개 지표가 하위 25% (${worst.join(', ')})`;
  } else if (top.length >= 3) {
    headline = `피어 대비 ${top.length}개 지표가 상위 25% — 양호`;
  }
  return { worstQuartileRatios: worst, topQuartileRatios: top, headline };
}

// ---------------------------------------------------------------------------
// Adapter: stored statements → combined insights (for the financials panel)
// ---------------------------------------------------------------------------

export type RawStatement = {
  fiscalYear: number | null;
  periodEndDate?: Date | string | null;
  operatingIncomeKrw: unknown;
  interestExpenseKrw: unknown;
  revenueKrw: unknown;
  totalAssetsKrw: unknown;
  totalEquityKrw: unknown;
  currentAssetsKrw: unknown;
  currentLiabilitiesKrw: unknown;
};

/** Derive per-period KR ratios from stored figures (for trend analysis). */
export function statementsToTrendPeriods(rows: RawStatement[]): CreditTrendPeriod[] {
  return rows.map((r) => {
    const op = toNumberOrNull(r.operatingIncomeKrw);
    const int = toNumberOrNull(r.interestExpenseKrw);
    const rev = toNumberOrNull(r.revenueKrw);
    const assets = toNumberOrNull(r.totalAssetsKrw);
    const equity = toNumberOrNull(r.totalEquityKrw);
    const ca = toNumberOrNull(r.currentAssetsKrw);
    const cl = toNumberOrNull(r.currentLiabilitiesKrw);
    return {
      fiscalYear: r.fiscalYear,
      debtToEquityPct:
        assets !== null && equity !== null && equity > 0
          ? round(((assets - equity) / equity) * 100, 1)
          : null,
      interestCoverage: op !== null && int !== null && int > 0 ? round(op / int, 2) : null,
      operatingMarginPct:
        op !== null && rev !== null && rev > 0 ? round((op / rev) * 100, 1) : null,
      revenueKrw: rev,
      currentRatio: ca !== null && cl !== null && cl > 0 ? round(ca / cl, 2) : null
    };
  });
}

export type StatementCreditInsights = {
  marginalFirm: MarginalFirmResult;
  trend: CreditTrendResult;
  freshness: FinancialFreshness;
};

/** Combine the multi-period credit insights for a single counterparty's filings. */
export function buildStatementCreditInsights(rows: RawStatement[]): StatementCreditInsights {
  const latest = [...rows]
    .filter((r) => r.fiscalYear != null)
    .sort((a, b) => (b.fiscalYear ?? 0) - (a.fiscalYear ?? 0))[0];
  return {
    marginalFirm: detectMarginalFirm(rows),
    trend: computeCreditTrend(statementsToTrendPeriods(rows)),
    freshness: latest
      ? assessFinancialFreshness({
          periodEndDate: latest.periodEndDate,
          fiscalYear: latest.fiscalYear
        })
      : { ageMonths: null, staleness: 'UNKNOWN', flag: null }
  };
}
