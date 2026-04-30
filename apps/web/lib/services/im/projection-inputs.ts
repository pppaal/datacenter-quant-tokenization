/**
 * Derive forward-projection assumptions from the real bundle data
 * — macro rent growth, debt facility amortization schedule, and the
 * weighted facility rate — instead of hardcoded placeholders.
 *
 * Each picked input carries a `provenance` string the IM renders so
 * the LP can see where the number came from rather than treat it as
 * an arbitrary engine constant.
 */

type MacroSeriesPoint = {
  seriesKey: string;
  value: number;
  unit?: string | null;
};

type DebtFacilityLike = {
  facilityType?: string;
  commitmentKrw?: number | null;
  drawnAmountKrw?: number | null;
  interestRatePct?: number | null;
  amortizationTermMonths?: number | null;
  balloonPct?: number | null;
};

export type DerivedAssumption<T> = {
  value: T;
  provenance: string;
};

const SECTOR_RENT_GROWTH_FALLBACK_PCT = 3.0;
const SECTOR_AMORT_FALLBACK_PCT = 5.0;
const SECTOR_DEBT_RATE_FALLBACK_PCT = 5.0;

function asMacroPoints(series: unknown): MacroSeriesPoint[] {
  if (!Array.isArray(series)) return [];
  return series.filter(
    (s): s is MacroSeriesPoint =>
      !!s &&
      typeof s === 'object' &&
      typeof (s as MacroSeriesPoint).seriesKey === 'string' &&
      typeof (s as MacroSeriesPoint).value === 'number'
  );
}

/**
 * Pick revenue growth from the macro series. Real REPE underwriting
 * uses the rent_growth_pct reading + a sector premium for the
 * sponsor's operating leverage. We use rent_growth_pct directly
 * (with fallback) so the IM can show provenance.
 */
export function pickRevenueGrowthPct(
  macroSeries: unknown
): DerivedAssumption<number> {
  const points = asMacroPoints(macroSeries);
  const rentGrowth = points.find((p) => p.seriesKey === 'rent_growth_pct');
  if (rentGrowth) {
    return {
      value: rentGrowth.value,
      provenance: `macro.rent_growth_pct = ${rentGrowth.value.toFixed(1)}%`
    };
  }
  return {
    value: SECTOR_RENT_GROWTH_FALLBACK_PCT,
    provenance: `sector fallback (${SECTOR_RENT_GROWTH_FALLBACK_PCT.toFixed(1)}%) — no macro rent_growth_pct on file`
  };
}

/**
 * Derive yearly debt amortization rate from the facility schedule.
 * Standard amortization math: (1 − balloon%) / term_years per year.
 * For SCULPTED profiles we still treat the implied straight-line
 * pace as a reasonable annualized rate for projection purposes.
 *
 * Falls back to the sector default when no facility is on file.
 */
export function pickDebtAmortizationPct(
  facilities: DebtFacilityLike[] | null | undefined
): DerivedAssumption<number> {
  const valid = (facilities ?? []).filter(
    (f) =>
      typeof f.amortizationTermMonths === 'number' &&
      f.amortizationTermMonths! > 0
  );
  if (valid.length === 0) {
    return {
      value: SECTOR_AMORT_FALLBACK_PCT,
      provenance: `sector fallback (${SECTOR_AMORT_FALLBACK_PCT.toFixed(1)}%/yr) — no facility schedule on file`
    };
  }
  // Weight by commitment when available, otherwise simple mean.
  const totalWeight = valid.reduce(
    (sum, f) => sum + (f.commitmentKrw ?? 1),
    0
  );
  const weightedYearlyAmort =
    valid.reduce((sum, f) => {
      const balloon = f.balloonPct ?? 0;
      const termYears = (f.amortizationTermMonths ?? 84) / 12;
      const yearlyAmort = (1 - balloon / 100) / termYears * 100;
      const weight = f.commitmentKrw ?? 1;
      return sum + yearlyAmort * weight;
    }, 0) / totalWeight;
  return {
    value: weightedYearlyAmort,
    provenance: `commitment-weighted facility schedule (${weightedYearlyAmort.toFixed(1)}%/yr)`
  };
}

/**
 * Pick the weighted blended interest rate for the projection
 * baseline. If any facility records its own rate, use the
 * commitment-weighted average; otherwise fall back to the macro
 * debt_cost_pct reading; otherwise to the sector default.
 */
export function pickInterestRatePct(
  facilities: DebtFacilityLike[] | null | undefined,
  macroSeries: unknown
): DerivedAssumption<number> {
  const validFacilities = (facilities ?? []).filter(
    (f) => typeof f.interestRatePct === 'number'
  );
  if (validFacilities.length > 0) {
    const totalWeight = validFacilities.reduce(
      (sum, f) => sum + (f.commitmentKrw ?? 1),
      0
    );
    const weighted =
      validFacilities.reduce(
        (sum, f) =>
          sum + (f.interestRatePct ?? 0) * (f.commitmentKrw ?? 1),
        0
      ) / totalWeight;
    return {
      value: weighted,
      provenance: `commitment-weighted facility rate (${weighted.toFixed(2)}%)`
    };
  }
  const points = asMacroPoints(macroSeries);
  const debtCost = points.find((p) => p.seriesKey === 'debt_cost_pct');
  if (debtCost) {
    return {
      value: debtCost.value,
      provenance: `macro.debt_cost_pct = ${debtCost.value.toFixed(2)}%`
    };
  }
  return {
    value: SECTOR_DEBT_RATE_FALLBACK_PCT,
    provenance: `sector fallback (${SECTOR_DEBT_RATE_FALLBACK_PCT.toFixed(2)}%)`
  };
}
