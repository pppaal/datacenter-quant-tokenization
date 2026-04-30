/**
 * Counterparty credit analysis helpers used by the IM financials
 * card. Computes income-statement / balance-sheet derivatives,
 * ratio table with thresholds, three-year projection at stated
 * growth, and a two-axis stress test (revenue shock + rate shock).
 *
 * All inputs are nullable to handle partial filings — the card
 * renders "—" for any cell that lacks the necessary inputs.
 */

type Decimalish =
  | number
  | { toNumber: () => number }
  | null
  | undefined;

function toNum(value: Decimalish): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof (value as { toNumber?: () => number }).toNumber === 'function') {
    const v = (value as { toNumber: () => number }).toNumber();
    return Number.isFinite(v) ? v : null;
  }
  return null;
}

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
  cashKrw?: Decimalish;
  totalDebtKrw?: Decimalish;
  totalAssetsKrw?: Decimalish;
  totalEquityKrw?: Decimalish;
  interestExpenseKrw?: Decimalish;
};

export type IncomeStatementSlice = {
  revenueKrw: number | null;
  ebitdaKrw: number | null;
  ebitdaMarginPct: number | null;
  interestExpenseKrw: number | null;
  /** EBITDA – interest expense — proxy for pre-tax income absent a full IS. */
  preTaxIncomeProxyKrw: number | null;
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
  const ebitdaMarginPct = revenueKrw && ebitdaKrw ? (ebitdaKrw / revenueKrw) * 100 : null;
  const preTaxIncomeProxyKrw =
    ebitdaKrw !== null && interestExpenseKrw !== null
      ? ebitdaKrw - interestExpenseKrw
      : null;
  return {
    revenueKrw,
    ebitdaKrw,
    ebitdaMarginPct,
    interestExpenseKrw,
    preTaxIncomeProxyKrw
  };
}

export function buildBalanceSheet(stmt: FinancialStatementLike): BalanceSheetSlice {
  const totalAssetsKrw = toNum(stmt.totalAssetsKrw);
  const cashKrw = toNum(stmt.cashKrw);
  const totalDebtKrw = toNum(stmt.totalDebtKrw);
  const totalEquityKrw = toNum(stmt.totalEquityKrw);
  const netDebtKrw =
    totalDebtKrw !== null && cashKrw !== null ? totalDebtKrw - cashKrw : null;
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
  const interestCoverage = safeDiv(inc.ebitdaKrw, inc.interestExpenseKrw);
  const debtToEquity = safeDiv(bs.totalDebtKrw, bs.totalEquityKrw);
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
      label: 'Interest coverage (EBITDA / Interest)',
      formula: 'EBITDA ÷ Interest expense',
      value: interestCoverage,
      unit: 'x',
      benchmark: 3.0,
      preferred: 'higher',
      tone: band(interestCoverage, 3.0, 'higher'),
      interpretation:
        interestCoverage === null
          ? 'Insufficient inputs.'
          : interestCoverage >= 3.5
            ? 'Comfortable coverage; absorbs typical rate shocks.'
            : interestCoverage >= 2.0
              ? 'Adequate coverage; close to 2.0x lender minimum.'
              : 'Below 2.0x lender minimum; covenant breach risk.'
    },
    {
      key: 'debtToEquity',
      label: 'Debt / Equity',
      formula: 'Total Debt ÷ Total Equity',
      value: debtToEquity,
      unit: 'x',
      benchmark: 1.5,
      preferred: 'lower',
      tone: band(debtToEquity, 1.5, 'lower'),
      interpretation:
        debtToEquity === null
          ? 'Insufficient inputs.'
          : debtToEquity <= 1.3
            ? 'Conservative capitalization.'
            : debtToEquity <= 1.7
              ? 'Standard PE-sponsor capitalization.'
              : 'Elevated debt-to-equity; tighter monitoring warranted.'
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
      label: 'EBITDA / Equity (ROE proxy)',
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
      label: 'EBITDA / Assets (ROA proxy)',
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
  const incrementalInterest =
    bs.totalDebtKrw * debtRepricedPct * (options.rateShockBps / 10_000);

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
      leverage !== null && coverage !== null
        ? leverage <= 4.0 && coverage >= 2.0
        : null;
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
