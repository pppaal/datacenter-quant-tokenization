/**
 * Cash flow + free cash flow + CFADS-based DSCR helpers used by the
 * IM credit analysis card. The FinancialStatement schema does not
 * carry a full cash-flow statement, so each helper accepts the
 * underlying inputs (EBITDA, interest, tax rate, capex, WC change)
 * and returns the derived line. The page passes assumption-derived
 * inputs (e.g. maintenance capex = 2% of revenue) and renders the
 * provenance under the table.
 */

type Decimalish =
  | number
  | { toNumber: () => number }
  | null
  | undefined;

function toNum(v: Decimalish): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof (v as { toNumber?: () => number }).toNumber === 'function') {
    const n = (v as { toNumber: () => number }).toNumber();
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export type CashFlowInputs = {
  /** From the income statement. */
  ebitdaKrw: Decimalish;
  /** From the income statement. */
  interestExpenseKrw: Decimalish;
  /** Effective tax rate as a decimal — e.g. 0.242 for 24.2%. */
  taxRate: number;
  /** D&A as a fraction of revenue (proxy when not on file). */
  daRateOfRevenue: number;
  /** Maintenance capex as a fraction of revenue. */
  maintCapexRateOfRevenue: number;
  /** Working capital change as a fraction of revenue change (negative = build). */
  wcChangeRate: number;
  /** Revenue (anchors D&A / capex / WC drag). */
  revenueKrw: Decimalish;
  /** Mandatory debt principal repayment in the period (for CFADS denominator). */
  principalRepaymentKrw?: Decimalish;
};

export type CashFlowSlice = {
  ebitdaKrw: number | null;
  /** EBITDA × (1 − tax) − ΔWC; pre-capex operating cash. */
  operatingCashFlowKrw: number | null;
  /** Maintenance capex outflow. */
  maintenanceCapexKrw: number | null;
  /** Operating CF − maintenance capex. */
  freeCashFlowKrw: number | null;
  /** Free cash flow available for debt service: FCF + interest expense. */
  cfadsKrw: number | null;
  /** Total debt service for the period: interest + scheduled principal. */
  debtServiceKrw: number | null;
  /** CFADS / debt service — the lender-grade DSCR. */
  cfadsDscr: number | null;
  /** Effective tax used (decimal). */
  taxRate: number;
  /** Implied D&A (revenue × daRateOfRevenue). */
  daKrw: number | null;
  /** EBIT proxy = EBITDA − D&A. */
  ebitKrw: number | null;
  /** Net income proxy = (EBIT − interest) × (1 − tax). */
  netIncomeKrw: number | null;
};

export function buildCashFlowSlice(inputs: CashFlowInputs): CashFlowSlice {
  const ebitda = toNum(inputs.ebitdaKrw);
  const interest = toNum(inputs.interestExpenseKrw);
  const revenue = toNum(inputs.revenueKrw);
  const principal = toNum(inputs.principalRepaymentKrw) ?? 0;
  const taxRate = inputs.taxRate;

  if (ebitda === null) {
    return {
      ebitdaKrw: null,
      operatingCashFlowKrw: null,
      maintenanceCapexKrw: null,
      freeCashFlowKrw: null,
      cfadsKrw: null,
      debtServiceKrw: null,
      cfadsDscr: null,
      taxRate,
      daKrw: null,
      ebitKrw: null,
      netIncomeKrw: null
    };
  }

  const daKrw = revenue !== null ? revenue * inputs.daRateOfRevenue : null;
  const ebitKrw = daKrw !== null ? ebitda - daKrw : ebitda;
  // Cash tax on operating earnings: tax × EBIT (pre-interest), so debt
  // tax shield is captured implicitly by the post-interest net income
  // line below.
  const cashTax = ebitKrw !== null ? Math.max(0, ebitKrw) * taxRate : 0;
  const maintenanceCapexKrw = revenue !== null ? revenue * inputs.maintCapexRateOfRevenue : 0;
  const wcDrag = revenue !== null ? revenue * inputs.wcChangeRate : 0;
  const operatingCashFlowKrw = ebitda - cashTax + wcDrag;
  const freeCashFlowKrw = operatingCashFlowKrw - maintenanceCapexKrw;
  // CFADS = operating cash + interest add-back (interest is part of debt service so
  // we don't double-count). Equivalent to FCF + interest.
  const cfadsKrw = interest !== null ? freeCashFlowKrw + interest : freeCashFlowKrw;
  const debtServiceKrw = (interest ?? 0) + principal;
  const cfadsDscr = debtServiceKrw > 0 ? cfadsKrw / debtServiceKrw : null;
  const netIncomeKrw =
    ebitKrw !== null && interest !== null
      ? (ebitKrw - interest) * (1 - taxRate)
      : null;

  return {
    ebitdaKrw: ebitda,
    operatingCashFlowKrw,
    maintenanceCapexKrw,
    freeCashFlowKrw,
    cfadsKrw,
    debtServiceKrw,
    cfadsDscr,
    taxRate,
    daKrw,
    ebitKrw,
    netIncomeKrw
  };
}

/**
 * Default cash-flow assumption set used when the IM lacks a full
 * cash-flow statement on file. Values are conservative defaults
 * representative of stabilized infrastructure / data-center
 * sponsors. The IM renders these alongside the CFADS line so an LP
 * can see exactly what was assumed.
 */
export const DEFAULT_CASH_FLOW_ASSUMPTIONS = {
  daRateOfRevenue: 0.06, // 6% of revenue — typical infrastructure D&A
  maintCapexRateOfRevenue: 0.025, // 2.5% maintenance capex
  wcChangeRate: -0.005, // 0.5% revenue tied up as WC build per period
  taxRate: 0.242 // KR corporate tax, can be overridden from taxAssumption
};

export type CFADSProjectionRow = {
  year: string;
  ebitdaKrw: number;
  cashFlowOperatingKrw: number;
  freeCashFlowKrw: number;
  cfadsKrw: number;
  debtServiceKrw: number;
  cfadsDscr: number | null;
};

/**
 * Project CFADS DSCR forward across the same horizon used by
 * projectFinancials(). Holds the cash-flow assumption rates
 * constant; debt amortizes at the supplied annualized rate.
 */
export function projectCfadsDscr(
  base: {
    revenueKrw: number;
    ebitdaMarginPct: number;
    interestRatePct: number;
    totalDebtKrw: number;
  },
  options: {
    revenueGrowthPct: number;
    debtAmortizationPct: number;
    horizonYears: number;
    taxRate: number;
    daRateOfRevenue?: number;
    maintCapexRateOfRevenue?: number;
    wcChangeRate?: number;
  },
  baseYear: number = new Date().getFullYear()
): CFADSProjectionRow[] {
  const da = options.daRateOfRevenue ?? DEFAULT_CASH_FLOW_ASSUMPTIONS.daRateOfRevenue;
  const capex =
    options.maintCapexRateOfRevenue ?? DEFAULT_CASH_FLOW_ASSUMPTIONS.maintCapexRateOfRevenue;
  const wc = options.wcChangeRate ?? DEFAULT_CASH_FLOW_ASSUMPTIONS.wcChangeRate;
  const rows: CFADSProjectionRow[] = [];
  for (let i = 0; i <= options.horizonYears; i += 1) {
    const growth = Math.pow(1 + options.revenueGrowthPct / 100, i);
    const revenue = base.revenueKrw * growth;
    const ebitda = revenue * (base.ebitdaMarginPct / 100);
    const daKrw = revenue * da;
    const ebit = ebitda - daKrw;
    const cashTax = Math.max(0, ebit) * options.taxRate;
    const maintCapex = revenue * capex;
    const wcDrag = revenue * wc;
    const operatingCashFlow = ebitda - cashTax + wcDrag;
    const fcf = operatingCashFlow - maintCapex;
    const debt = base.totalDebtKrw * Math.pow(1 - options.debtAmortizationPct / 100, i);
    const interest = debt * (base.interestRatePct / 100);
    const principal = debt * (options.debtAmortizationPct / 100);
    const cfads = fcf + interest;
    const debtService = interest + principal;
    const cfadsDscr = debtService > 0 ? cfads / debtService : null;
    rows.push({
      year: i === 0 ? `${baseYear}A` : `${baseYear + i}E`,
      ebitdaKrw: ebitda,
      cashFlowOperatingKrw: operatingCashFlow,
      freeCashFlowKrw: fcf,
      cfadsKrw: cfads,
      debtServiceKrw: debtService,
      cfadsDscr
    });
  }
  return rows;
}
