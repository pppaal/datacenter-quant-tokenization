/**
 * Liquidity ladder — maturity / amortization schedule per debt
 * facility, mapped against next-12-month liquid resources (cash +
 * estimated operating cash flow). Lets the IM show whether the
 * borrower can meet near-term debt service from internal sources or
 * needs to refinance.
 */

type DebtFacilityLike = {
  id?: string;
  facilityType?: string;
  lenderName?: string | null;
  commitmentKrw?: number | null;
  drawnAmountKrw?: number | null;
  interestRatePct?: number | null;
  amortizationTermMonths?: number | null;
  balloonPct?: number | null;
};

export type MaturityRow = {
  facilityKey: string;
  label: string;
  drawnKrw: number;
  interestRatePct: number | null;
  termYears: number | null;
  /** Implied straight-line annual amortization. */
  yearlyAmortizationKrw: number | null;
  balloonKrw: number | null;
  /** Year of the implied balloon payment (term offset from current year). */
  balloonYear: string | null;
};

export type LiquiditySummary = {
  rows: MaturityRow[];
  twelveMonthDebtServiceKrw: number;
  cashOnHandKrw: number | null;
  estimatedAnnualCashFlowKrw: number | null;
  /** (cash + OCF) ÷ next-12mo debt service. ≥ 1.0 = self-funded. */
  liquidityCoverage: number | null;
  /** Worst single year's required principal repayment over the horizon. */
  peakAnnualPrincipalKrw: number | null;
  peakYear: string | null;
};

export function buildLiquidityLadder(
  facilities: DebtFacilityLike[] | null | undefined,
  options: {
    cashKrw: number | null;
    estimatedAnnualCashFlowKrw: number | null;
  },
  baseYear: number = new Date().getFullYear()
): LiquiditySummary {
  const valid = (facilities ?? []).filter(
    (f) => typeof f.drawnAmountKrw === 'number' && (f.drawnAmountKrw ?? 0) > 0
  );

  const rows: MaturityRow[] = valid.map((f, idx) => {
    const drawn = f.drawnAmountKrw!;
    const balloonPct = f.balloonPct ?? 0;
    const termYears = f.amortizationTermMonths ? f.amortizationTermMonths / 12 : null;
    const yearlyAmort =
      termYears && termYears > 0 ? (drawn * (1 - balloonPct / 100)) / termYears : null;
    const balloonKrw = balloonPct > 0 ? drawn * (balloonPct / 100) : null;
    const balloonYear =
      termYears !== null ? `${baseYear + Math.round(termYears)}` : null;
    return {
      facilityKey: f.id ?? `f${idx}`,
      label: `${f.facilityType ?? 'Facility'}${f.lenderName ? ` · ${f.lenderName}` : ''}`,
      drawnKrw: drawn,
      interestRatePct: f.interestRatePct ?? null,
      termYears,
      yearlyAmortizationKrw: yearlyAmort,
      balloonKrw,
      balloonYear
    };
  });

  // Approximate next-12-month debt service: sum of yearly amortization
  // across facilities + interest expense (drawn × rate).
  let twelveMonthDebtService = 0;
  for (const f of valid) {
    const drawn = f.drawnAmountKrw ?? 0;
    const balloonPct = f.balloonPct ?? 0;
    const termYears = f.amortizationTermMonths ? f.amortizationTermMonths / 12 : 0;
    const yearlyAmort = termYears > 0 ? (drawn * (1 - balloonPct / 100)) / termYears : 0;
    const yearlyInterest = drawn * ((f.interestRatePct ?? 0) / 100);
    twelveMonthDebtService += yearlyAmort + yearlyInterest;
  }

  const liquidityCoverage =
    twelveMonthDebtService > 0 && options.cashKrw !== null
      ? ((options.cashKrw + (options.estimatedAnnualCashFlowKrw ?? 0)) /
          twelveMonthDebtService)
      : null;

  // Find the year with the largest principal repayment (typically the
  // balloon year). Useful for highlighting refinancing concentration.
  let peakAnnualPrincipalKrw: number | null = null;
  let peakYear: string | null = null;
  for (const row of rows) {
    const candidates: Array<{ year: string | null; principal: number | null }> = [
      {
        year: row.termYears !== null ? `${baseYear + 1}` : null,
        principal: row.yearlyAmortizationKrw
      },
      { year: row.balloonYear, principal: row.balloonKrw }
    ];
    for (const c of candidates) {
      if (c.principal !== null && (peakAnnualPrincipalKrw === null || c.principal > peakAnnualPrincipalKrw)) {
        peakAnnualPrincipalKrw = c.principal;
        peakYear = c.year;
      }
    }
  }

  return {
    rows,
    twelveMonthDebtServiceKrw: twelveMonthDebtService,
    cashOnHandKrw: options.cashKrw,
    estimatedAnnualCashFlowKrw: options.estimatedAnnualCashFlowKrw,
    liquidityCoverage,
    peakAnnualPrincipalKrw,
    peakYear
  };
}
