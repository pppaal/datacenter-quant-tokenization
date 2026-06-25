/**
 * Counterparty credit analysis helpers used by the IM financials
 * card. Computes income-statement / balance-sheet derivatives,
 * ratio table with thresholds, three-year projection at stated
 * growth, and a two-axis stress test (revenue shock + rate shock).
 *
 * All inputs are nullable to handle partial filings — the card
 * renders "—" for any cell that lacks the necessary inputs.
 */

import { type Decimalish, toNum } from '@/lib/finance/decimalish';

function safeDiv(a: number | null, b: number | null): number | null {
  if (a === null || b === null || b === 0) return null;
  return a / b;
}

export type FinancialStatementLike = {
  fiscalYear?: number | null;
  fiscalPeriod?: string | null;
  periodEndDate?: Date | null;
  currency?: string | null;
  provenanceSystem?: string | null;
  revenueKrw?: Decimalish;
  ebitdaKrw?: Decimalish;
  // Filed K-IFRS lines (영업이익 / 당기순이익) — when present these are the
  // authoritative figures; the EBITDA-down proxies are only a fallback.
  operatingIncomeKrw?: Decimalish;
  netIncomeKrw?: Decimalish;
  cashKrw?: Decimalish;
  totalDebtKrw?: Decimalish;
  totalAssetsKrw?: Decimalish;
  totalEquityKrw?: Decimalish;
  interestExpenseKrw?: Decimalish;
  // Current-portion lines for 유동비율 (current ratio).
  currentAssetsKrw?: Decimalish;
  currentLiabilitiesKrw?: Decimalish;
};

export type IncomeStatementSlice = {
  revenueKrw: number | null;
  ebitdaKrw: number | null;
  ebitdaMarginPct: number | null;
  interestExpenseKrw: number | null;
  /** EBITDA – interest expense — proxy for pre-tax income absent a full IS. */
  preTaxIncomeProxyKrw: number | null;
  /** Filed operating income (영업이익), null when not on the statement. */
  operatingIncomeKrw: number | null;
  /** Filed net income (당기순이익), null when not on the statement. */
  netIncomeKrw: number | null;
};

export type BalanceSheetSlice = {
  totalAssetsKrw: number | null;
  cashKrw: number | null;
  totalDebtKrw: number | null;
  netDebtKrw: number | null;
  totalEquityKrw: number | null;
  /** Total equity / Total assets — book equity ratio. */
  equityRatio: number | null;
  /** Total assets – Total equity – Total debt — capital-structure residual. */
  otherLiabilitiesKrw: number | null;
};

export function buildIncomeStatement(stmt: FinancialStatementLike): IncomeStatementSlice {
  const revenueKrw = toNum(stmt.revenueKrw);
  const ebitdaKrw = toNum(stmt.ebitdaKrw);
  const interestExpenseKrw = toNum(stmt.interestExpenseKrw);
  // Margin is defined whenever both lines are present and revenue is non-zero.
  // A legitimately reported zero (or negative) EBITDA is a real data point —
  // a `revenueKrw && ebitdaKrw` truthiness gate would mis-report break-even
  // (EBITDA = 0) as "Insufficient inputs" instead of 0%.
  const ebitdaMarginPct =
    revenueKrw !== null && revenueKrw !== 0 && ebitdaKrw !== null
      ? (ebitdaKrw / revenueKrw) * 100
      : null;
  const preTaxIncomeProxyKrw =
    ebitdaKrw !== null && interestExpenseKrw !== null ? ebitdaKrw - interestExpenseKrw : null;
  return {
    revenueKrw,
    ebitdaKrw,
    ebitdaMarginPct,
    interestExpenseKrw,
    preTaxIncomeProxyKrw,
    operatingIncomeKrw: toNum(stmt.operatingIncomeKrw),
    netIncomeKrw: toNum(stmt.netIncomeKrw)
  };
}

export function buildBalanceSheet(stmt: FinancialStatementLike): BalanceSheetSlice {
  const totalAssetsKrw = toNum(stmt.totalAssetsKrw);
  const cashKrw = toNum(stmt.cashKrw);
  const totalDebtKrw = toNum(stmt.totalDebtKrw);
  const totalEquityKrw = toNum(stmt.totalEquityKrw);
  const netDebtKrw = totalDebtKrw !== null && cashKrw !== null ? totalDebtKrw - cashKrw : null;
  const equityRatio = safeDiv(totalEquityKrw, totalAssetsKrw);
  const otherLiabilitiesKrw =
    totalAssetsKrw !== null && totalDebtKrw !== null && totalEquityKrw !== null
      ? totalAssetsKrw - totalDebtKrw - totalEquityKrw
      : null;
  return {
    totalAssetsKrw,
    cashKrw,
    totalDebtKrw,
    netDebtKrw,
    totalEquityKrw,
    equityRatio,
    otherLiabilitiesKrw
  };
}

/**
 * Per-ratio threshold / interpretation. The IM colour-codes each
 * row by `tone` so the LP can see at a glance which ratios are
 * inside the typical covenant band.
 */
export type CreditRatio = {
  key: string;
  label: string;
  formula: string;
  value: number | null;
  unit: 'x' | 'pct' | 'krw';
  /** Sector / covenant benchmark for context, e.g. 4.0 means "typical max leverage covenant". */
  benchmark: number | null;
  /** What direction is "good" — higher (e.g. interest coverage) or lower (e.g. leverage). */
  preferred: 'higher' | 'lower';
  tone: 'good' | 'warn' | 'risk' | null;
  interpretation: string;
};

function band(
  value: number | null,
  benchmark: number | null,
  preferred: 'higher' | 'lower'
): 'good' | 'warn' | 'risk' | null {
  if (value === null || benchmark === null) return null;
  // ±15% around benchmark = warn band; beyond = good or risk depending on direction
  const ratio = value / benchmark;
  if (preferred === 'higher') {
    if (ratio >= 1.15) return 'good';
    if (ratio >= 0.85) return 'warn';
    return 'risk';
  }
  if (ratio <= 0.85) return 'good';
  if (ratio <= 1.15) return 'warn';
  return 'risk';
}

export function buildCreditRatios(stmt: FinancialStatementLike): CreditRatio[] {
  const inc = buildIncomeStatement(stmt);
  const bs = buildBalanceSheet(stmt);

  const leverage = safeDiv(bs.totalDebtKrw, inc.ebitdaKrw);
  // 이자보상배율 (KR interest-coverage): operating income (영업이익) ÷ interest,
  // matching tenant-credit + the admin panel. Falls back to EBITDA when the
  // filing has no operating-income line.
  const interestCoverage = safeDiv(inc.operatingIncomeKrw ?? inc.ebitdaKrw, inc.interestExpenseKrw);
  // 부채비율 (KR debt-to-equity): TOTAL liabilities ÷ equity, not just debt.
  const totalLiabilitiesKrw =
    bs.totalAssetsKrw !== null && bs.totalEquityKrw !== null
      ? bs.totalAssetsKrw - bs.totalEquityKrw
      : null;
  const debtToEquity = safeDiv(totalLiabilitiesKrw, bs.totalEquityKrw);
  const cashToDebt = safeDiv(bs.cashKrw, bs.totalDebtKrw);
  const netDebtToEbitda = safeDiv(bs.netDebtKrw, inc.ebitdaKrw);
  const roeProxy = safeDiv(inc.ebitdaKrw, bs.totalEquityKrw);
  const roaProxy = safeDiv(inc.ebitdaKrw, bs.totalAssetsKrw);

  const ratios: CreditRatio[] = [
    {
      key: 'leverage',
      label: 'Leverage (Debt / EBITDA)',
      formula: 'Total Debt ÷ EBITDA',
      value: leverage,
      unit: 'x',
      benchmark: 4.0,
      preferred: 'lower',
      tone: band(leverage, 4.0, 'lower'),
      interpretation:
        leverage === null
          ? 'Insufficient inputs.'
          : leverage <= 3.4
            ? 'Materially below typical 4.0x leverage covenant.'
            : leverage <= 4.6
              ? 'Within typical 4.0x covenant band; modest headroom.'
              : 'Above 4.0x covenant; refinancing scrutiny required.'
    },
    {
      key: 'netLeverage',
      label: 'Net leverage (Net Debt / EBITDA)',
      formula: '(Debt − Cash) ÷ EBITDA',
      value: netDebtToEbitda,
      unit: 'x',
      benchmark: 3.5,
      preferred: 'lower',
      tone: band(netDebtToEbitda, 3.5, 'lower'),
      interpretation:
        netDebtToEbitda === null
          ? 'Insufficient inputs.'
          : netDebtToEbitda <= 3.0
            ? 'Conservative net leverage profile.'
            : netDebtToEbitda <= 4.0
              ? 'Net leverage within typical PE-sponsor band.'
              : 'Net leverage above sponsor norms; expect tighter pricing.'
    },
    {
      key: 'interestCoverage',
      label: 'Interest coverage (이자보상배율)',
      formula: '영업이익 ÷ Interest expense (EBITDA fallback)',
      value: interestCoverage,
      unit: 'x',
      benchmark: 3.0,
      preferred: 'higher',
      tone: band(interestCoverage, 3.0, 'higher'),
      interpretation:
        interestCoverage === null
          ? 'Insufficient inputs.'
          : interestCoverage >= 3.0
            ? 'Comfortable coverage (≥3.0x).'
            : interestCoverage >= 1.5
              ? 'Adequate coverage, but below the 3.0x comfort level.'
              : 'Below 1.5x — inadequate; sustained <1.0x flags 한계기업 risk.'
    },
    {
      key: 'debtToEquity',
      label: 'Debt-to-equity (부채비율)',
      formula: 'Total liabilities ÷ Total equity',
      value: debtToEquity,
      unit: 'x',
      benchmark: 2.0,
      preferred: 'lower',
      tone: band(debtToEquity, 2.0, 'lower'),
      interpretation:
        debtToEquity === null
          ? 'Insufficient inputs.'
          : debtToEquity <= 1.0
            ? 'Conservative capitalization (부채비율 ≤100%).'
            : debtToEquity <= 2.0
              ? 'Within the ≤200% KR comfort band.'
              : 'Above 200% — elevated leverage; tighter monitoring warranted.'
    },
    {
      key: 'cashToDebt',
      label: 'Cash / Debt',
      formula: 'Cash ÷ Total Debt',
      value: cashToDebt,
      unit: 'x',
      benchmark: 0.15,
      preferred: 'higher',
      tone: band(cashToDebt, 0.15, 'higher'),
      interpretation:
        cashToDebt === null
          ? 'Insufficient inputs.'
          : cashToDebt >= 0.18
            ? 'Solid liquidity buffer.'
            : cashToDebt >= 0.1
              ? 'Adequate liquidity vs near-term debt.'
              : 'Thin liquidity vs debt; refinancing dependency.'
    },
    {
      key: 'ebitdaMargin',
      label: 'EBITDA margin',
      formula: 'EBITDA ÷ Revenue',
      value: inc.ebitdaMarginPct,
      unit: 'pct',
      benchmark: 30,
      preferred: 'higher',
      tone: band(inc.ebitdaMarginPct, 30, 'higher'),
      interpretation:
        inc.ebitdaMarginPct === null
          ? 'Insufficient inputs.'
          : inc.ebitdaMarginPct >= 35
            ? 'Strong margin profile vs sector norms.'
            : inc.ebitdaMarginPct >= 25
              ? 'In line with infrastructure-sponsor margin range.'
              : 'Margin below sector norms; cost-base review recommended.'
    },
    {
      key: 'roeProxy',
      label: 'EBITDA / Equity (capital efficiency)',
      formula: 'EBITDA ÷ Total Equity',
      value: roeProxy,
      unit: 'x',
      benchmark: 0.25,
      preferred: 'higher',
      tone: band(roeProxy, 0.25, 'higher'),
      interpretation:
        roeProxy === null
          ? 'Insufficient inputs.'
          : roeProxy >= 0.3
            ? 'Capital efficiency above sponsor norms.'
            : roeProxy >= 0.2
              ? 'Capital efficiency in line with sponsor peers.'
              : 'Capital efficiency below peer set; deleveraging path needed.'
    },
    {
      key: 'roaProxy',
      label: 'EBITDA / Assets (asset productivity)',
      formula: 'EBITDA ÷ Total Assets',
      value: roaProxy,
      unit: 'x',
      benchmark: 0.1,
      preferred: 'higher',
      tone: band(roaProxy, 0.1, 'higher'),
      interpretation:
        roaProxy === null
          ? 'Insufficient inputs.'
          : roaProxy >= 0.13
            ? 'Asset productivity above sector median.'
            : roaProxy >= 0.08
              ? 'Asset productivity in line with sector median.'
              : 'Asset productivity below sector median.'
    }
  ];

  // 유동비율 (current ratio) — only when the filing carries current-portion
  // lines. KR convention: ≥200% (2.0x) ideal, ≥100% (1.0x) minimum.
  const currentRatio = safeDiv(toNum(stmt.currentAssetsKrw), toNum(stmt.currentLiabilitiesKrw));
  if (currentRatio !== null) {
    ratios.push({
      key: 'currentRatio',
      label: 'Current ratio (유동비율)',
      formula: 'Current assets ÷ current liabilities',
      value: currentRatio,
      unit: 'x',
      benchmark: 2.0,
      preferred: 'higher',
      tone: currentRatio >= 2 ? 'good' : currentRatio >= 1 ? 'warn' : 'risk',
      interpretation:
        currentRatio >= 2
          ? 'Comfortable short-term liquidity (≥200%).'
          : currentRatio >= 1
            ? 'Current assets cover current liabilities but below the 200% comfort level.'
            : 'Current liabilities exceed current assets — short-term liquidity strain.'
    });
  }

  return ratios;
}

export type ProjectionRow = {
  year: string;
  revenueKrw: number | null;
  ebitdaKrw: number | null;
  ebitdaMarginPct: number | null;
  interestExpenseKrw: number | null;
  totalDebtKrw: number | null;
  leverage: number | null;
  interestCoverage: number | null;
};

/**
 * Project the income statement forward at stated growth assumptions.
 * Holds margin constant, applies revenue growth, lets debt amortize
 * by amortPct/year (e.g. 0.05 for 5% per year), and recomputes
 * leverage + coverage. Year 0 = stated; Year +N = projected.
 */
export function projectFinancials(
  stmt: FinancialStatementLike,
  options: {
    revenueGrowthPct: number;
    debtAmortizationPct: number;
    horizonYears: number;
  }
): ProjectionRow[] {
  const inc = buildIncomeStatement(stmt);
  const bs = buildBalanceSheet(stmt);
  if (inc.revenueKrw === null || inc.ebitdaKrw === null) return [];

  const baseMargin = inc.ebitdaMarginPct ?? 0;
  const rows: ProjectionRow[] = [];
  const baseYear = stmt.fiscalYear ?? new Date().getFullYear();

  for (let i = 0; i <= options.horizonYears; i += 1) {
    const growth = Math.pow(1 + options.revenueGrowthPct / 100, i);
    const projectedRevenue = inc.revenueKrw * growth;
    const projectedEbitda = projectedRevenue * (baseMargin / 100);
    const projectedDebt =
      bs.totalDebtKrw !== null
        ? bs.totalDebtKrw * Math.pow(1 - options.debtAmortizationPct / 100, i)
        : null;
    const projectedLeverage = safeDiv(projectedDebt, projectedEbitda);
    // Hold interest expense flat as a coarse proxy; the IM card can
    // overlay rate shocks separately via the stress slice.
    const projectedCoverage = safeDiv(projectedEbitda, inc.interestExpenseKrw);
    rows.push({
      year: i === 0 ? `${baseYear}A` : `${baseYear + i}E`,
      revenueKrw: projectedRevenue,
      ebitdaKrw: projectedEbitda,
      ebitdaMarginPct: baseMargin,
      interestExpenseKrw: inc.interestExpenseKrw,
      totalDebtKrw: projectedDebt,
      leverage: projectedLeverage,
      interestCoverage: projectedCoverage
    });
  }

  return rows;
}

export type StressRow = {
  scenario: string;
  ebitdaKrw: number | null;
  interestExpenseKrw: number | null;
  leverage: number | null;
  interestCoverage: number | null;
  /** Boolean health flag — passes if leverage <= 4.0 AND coverage >= 2.0. */
  passesCovenant: boolean | null;
};

/**
 * Two-axis sensitivity matrix: EBITDA shocks × rate shocks. Each
 * cell is a {coverage, leverage, passesCovenant} triple. Renders in
 * the IM as a 4×4 grid where the LP can read covenant pass/fail at
 * any combination of operating + financing stress.
 */
export type SensitivityCell = {
  ebitdaShockPct: number;
  rateShockBps: number;
  ebitdaKrw: number;
  interestExpenseKrw: number;
  leverage: number | null;
  interestCoverage: number | null;
  passesCovenant: boolean | null;
};

export type SensitivityMatrix = {
  ebitdaShocks: number[];
  rateShocks: number[];
  cells: SensitivityCell[][];
};

export function buildSensitivityMatrix(
  stmt: FinancialStatementLike,
  options: {
    ebitdaShocks?: number[];
    rateShocks?: number[];
    debtRepricedPct?: number;
  } = {}
): SensitivityMatrix | null {
  const inc = buildIncomeStatement(stmt);
  const bs = buildBalanceSheet(stmt);
  if (inc.ebitdaKrw === null || bs.totalDebtKrw === null) return null;

  const ebitdaShocks = options.ebitdaShocks ?? [0, -10, -20, -30];
  const rateShocks = options.rateShocks ?? [0, 100, 200, 300];
  const baseInterest = inc.interestExpenseKrw ?? 0;
  const debtRepricedPct = options.debtRepricedPct ?? 1.0;

  const cells = ebitdaShocks.map((es) =>
    rateShocks.map((rs): SensitivityCell => {
      const ebitda = inc.ebitdaKrw! * (1 + es / 100);
      const interest = baseInterest + bs.totalDebtKrw! * debtRepricedPct * (rs / 10_000);
      const leverage = safeDiv(bs.totalDebtKrw, ebitda);
      const coverage = interest > 0 ? safeDiv(ebitda, interest) : null;
      const passes =
        leverage !== null && coverage !== null ? leverage <= 4.0 && coverage >= 2.0 : null;
      return {
        ebitdaShockPct: es,
        rateShockBps: rs,
        ebitdaKrw: ebitda,
        interestExpenseKrw: interest,
        leverage,
        interestCoverage: coverage,
        passesCovenant: passes
      };
    })
  );

  return { ebitdaShocks, rateShocks, cells };
}

/**
 * Two-axis stress: revenue / EBITDA shock × interest-rate shock.
 * Real PE due diligence runs this every committee meeting because
 * coverage covenants typically trip first.
 */
export function buildStressTest(
  stmt: FinancialStatementLike,
  options: {
    ebitdaShockPct: number;
    rateShockBps: number;
    /** Fraction of debt that reprices on a refinance — 1.0 means all of it. */
    debtRepricedPct?: number;
  }
): StressRow[] {
  const inc = buildIncomeStatement(stmt);
  const bs = buildBalanceSheet(stmt);
  if (inc.ebitdaKrw === null || bs.totalDebtKrw === null) return [];

  const baseInterest = inc.interestExpenseKrw ?? 0;
  const debtRepricedPct = options.debtRepricedPct ?? 1.0;
  const incrementalInterest = bs.totalDebtKrw * debtRepricedPct * (options.rateShockBps / 10_000);

  const scenarios = [
    { label: 'Base case', ebitdaScale: 1.0, rateAdd: 0 },
    {
      label: `EBITDA −${Math.abs(options.ebitdaShockPct)}%`,
      ebitdaScale: 1 - options.ebitdaShockPct / 100,
      rateAdd: 0
    },
    {
      label: `Rate +${options.rateShockBps} bps`,
      ebitdaScale: 1.0,
      rateAdd: incrementalInterest
    },
    {
      label: `EBITDA −${Math.abs(options.ebitdaShockPct)}% & rate +${options.rateShockBps} bps`,
      ebitdaScale: 1 - options.ebitdaShockPct / 100,
      rateAdd: incrementalInterest
    }
  ];

  return scenarios.map((s) => {
    const ebitda = inc.ebitdaKrw! * s.ebitdaScale;
    const interest = baseInterest + s.rateAdd;
    const leverage = safeDiv(bs.totalDebtKrw, ebitda);
    const coverage = interest > 0 ? safeDiv(ebitda, interest) : null;
    const passes =
      leverage !== null && coverage !== null ? leverage <= 4.0 && coverage >= 2.0 : null;
    return {
      scenario: s.label,
      ebitdaKrw: ebitda,
      interestExpenseKrw: interest,
      leverage,
      interestCoverage: coverage,
      passesCovenant: passes
    };
  });
}
