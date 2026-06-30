/**
 * Portfolio-level stress testing (benchmark #7 — cf. Blooma).
 *
 * Applies a named macro/operating shock to each asset and recomputes the
 * institutional risk metrics (NOI, value, DSCR, debt yield, LTV) per asset and
 * aggregated across the portfolio. PURE and DB-free so it is fully unit-testable;
 * the `fromMonthlyKpis` adapter coerces the Prisma payload at the boundary.
 *
 * Standard CRE mechanics (no fabricated regulatory facts):
 *   - revenue = NOI + opex (when opex is known); vacancy & a revenue-flex shock
 *     scale revenue; an expense-flex shock scales opex → stressed NOI.
 *   - cap-rate shock (bps) moves the exit/cap rate → stressed value = NOI / cap.
 *   - rate shock (bps) adds interest on outstanding debt → stressed debt service.
 *   - DSCR = NOI / debt service; debt yield = NOI / debt; LTV = debt / value.
 */

import { toNumber, toNumberOrNull } from '@/lib/math';

export type StressScenario = {
  key: string;
  label: string;
  /** % change to gross revenue (negative = revenue down). */
  revenueFlexPct: number;
  /** % change to operating expenses (positive = expenses up). */
  expenseFlexPct: number;
  /** Additional vacancy in points, applied to revenue (positive = more vacancy). */
  vacancyDeltaPct: number;
  /** Cap-rate move in bps (positive = cap rate up → value down). */
  capRateDeltaBps: number;
  /** Funding-rate move in bps (positive = rates up → debt service up). */
  rateDeltaBps: number;
};

export type AssetStressInput = {
  assetId: string;
  label?: string | null;
  noiKrw: number;
  /** Operating expenses, for revenue/expense decomposition. Null → revenue ≈ NOI. */
  opexKrw?: number | null;
  /** Current hold / market value (KRW). */
  valueKrw: number;
  /** Outstanding debt (KRW). */
  debtKrw: number;
  /** Base annual debt service (KRW) if known. */
  debtServiceKrw?: number | null;
  /** Base DSCR, used to derive base debt service when debtServiceKrw is absent. */
  baseDscr?: number | null;
};

export type AssetRiskMetrics = {
  noiKrw: number;
  capRatePct: number | null;
  valueKrw: number | null;
  debtServiceKrw: number | null;
  dscr: number | null;
  debtYieldPct: number | null;
  ltvPct: number | null;
};

export type AssetStressResult = {
  assetId: string;
  label: string | null;
  base: AssetRiskMetrics;
  stressed: AssetRiskMetrics;
  valueChangePct: number | null;
  /** True when stressed DSCR falls below the covenant floor. */
  breachesDscr: boolean;
};

export type PortfolioStressResult = {
  scenario: StressScenario;
  dscrCovenant: number;
  assets: AssetStressResult[];
  portfolio: {
    baseNoiKrw: number;
    stressedNoiKrw: number;
    baseValueKrw: number;
    stressedValueKrw: number;
    debtKrw: number;
    stressedDebtServiceKrw: number;
    stressedDscr: number | null;
    stressedDebtYieldPct: number | null;
    stressedLtvPct: number | null;
    valueChangePct: number | null;
  };
  assetsBreachingDscr: number;
};

/** Built-in scenarios. Callers may also pass a custom `StressScenario`. */
export const STRESS_SCENARIOS: Record<string, StressScenario> = {
  base: {
    key: 'base',
    label: 'Base case',
    revenueFlexPct: 0,
    expenseFlexPct: 0,
    vacancyDeltaPct: 0,
    capRateDeltaBps: 0,
    rateDeltaBps: 0
  },
  mild: {
    key: 'mild',
    label: 'Mild downturn',
    revenueFlexPct: -5,
    expenseFlexPct: 3,
    vacancyDeltaPct: 5,
    capRateDeltaBps: 50,
    rateDeltaBps: 100
  },
  severe: {
    key: 'severe',
    label: 'Severe downturn',
    revenueFlexPct: -15,
    expenseFlexPct: 8,
    vacancyDeltaPct: 12,
    capRateDeltaBps: 150,
    rateDeltaBps: 250
  },
  rateShock: {
    key: 'rateShock',
    label: 'Rate shock',
    revenueFlexPct: 0,
    expenseFlexPct: 0,
    vacancyDeltaPct: 0,
    capRateDeltaBps: 75,
    rateDeltaBps: 300
  }
};

const DEFAULT_DSCR_COVENANT = 1.15;

function ratioPct(numerator: number, denominator: number | null): number | null {
  if (denominator == null || denominator <= 0) return null;
  return (numerator / denominator) * 100;
}

function baseMetrics(input: AssetStressInput): AssetRiskMetrics {
  const capRatePct = input.valueKrw > 0 ? (input.noiKrw / input.valueKrw) * 100 : null;
  const debtServiceKrw =
    input.debtServiceKrw ??
    (input.baseDscr && input.baseDscr > 0 ? input.noiKrw / input.baseDscr : null);
  return {
    noiKrw: input.noiKrw,
    capRatePct,
    valueKrw: input.valueKrw > 0 ? input.valueKrw : null,
    debtServiceKrw,
    dscr: debtServiceKrw && debtServiceKrw > 0 ? input.noiKrw / debtServiceKrw : null,
    debtYieldPct: ratioPct(input.noiKrw, input.debtKrw > 0 ? input.debtKrw : null),
    ltvPct: ratioPct(input.debtKrw, input.valueKrw > 0 ? input.valueKrw : null)
  };
}

function stressAsset(
  input: AssetStressInput,
  s: StressScenario,
  covenant: number
): AssetStressResult {
  const base = baseMetrics(input);

  // Revenue/expense decomposition. With opex known: revenue = NOI + opex.
  const opex = input.opexKrw ?? 0;
  const hasOpex = input.opexKrw != null && input.opexKrw > 0;
  const baseRevenue = input.noiKrw + opex;

  const stressedRevenue =
    baseRevenue * (1 + s.revenueFlexPct / 100) * (1 - s.vacancyDeltaPct / 100);
  const stressedOpex = opex * (1 + s.expenseFlexPct / 100);
  // If we have no opex split, fall back to flexing NOI directly.
  const stressedNoi = hasOpex
    ? stressedRevenue - stressedOpex
    : input.noiKrw * (1 + s.revenueFlexPct / 100) * (1 - s.vacancyDeltaPct / 100);

  const stressedCapRatePct =
    base.capRatePct == null ? null : base.capRatePct + s.capRateDeltaBps / 100;
  const stressedValueKrw =
    stressedCapRatePct != null && stressedCapRatePct > 0
      ? stressedNoi / (stressedCapRatePct / 100)
      : null;

  // Rate shock adds interest on outstanding debt to the base service.
  const stressedDebtServiceKrw =
    base.debtServiceKrw == null
      ? null
      : base.debtServiceKrw + input.debtKrw * (s.rateDeltaBps / 10000);

  const stressed: AssetRiskMetrics = {
    noiKrw: stressedNoi,
    capRatePct: stressedCapRatePct,
    valueKrw: stressedValueKrw,
    debtServiceKrw: stressedDebtServiceKrw,
    dscr:
      stressedDebtServiceKrw && stressedDebtServiceKrw > 0
        ? stressedNoi / stressedDebtServiceKrw
        : null,
    debtYieldPct: ratioPct(stressedNoi, input.debtKrw > 0 ? input.debtKrw : null),
    ltvPct: ratioPct(input.debtKrw, stressedValueKrw)
  };

  const valueChangePct =
    base.valueKrw && base.valueKrw > 0 && stressedValueKrw != null
      ? ((stressedValueKrw - base.valueKrw) / base.valueKrw) * 100
      : null;

  return {
    assetId: input.assetId,
    label: input.label ?? null,
    base,
    stressed,
    valueChangePct,
    breachesDscr: stressed.dscr != null && stressed.dscr < covenant
  };
}

export function runPortfolioStressTest(
  assets: AssetStressInput[],
  scenario: StressScenario,
  options?: { dscrCovenant?: number }
): PortfolioStressResult {
  const covenant = options?.dscrCovenant ?? DEFAULT_DSCR_COVENANT;
  const results = assets.map((a) => stressAsset(a, scenario, covenant));

  let baseNoi = 0;
  let stressedNoi = 0;
  let baseValue = 0;
  let stressedValue = 0;
  let debt = 0;
  let stressedDs = 0;
  for (const r of results) {
    baseNoi += r.base.noiKrw;
    stressedNoi += r.stressed.noiKrw;
    baseValue += r.base.valueKrw ?? 0;
    stressedValue += r.stressed.valueKrw ?? 0;
    // Aggregate debt once (same on base/stressed).
    debt += assets.find((a) => a.assetId === r.assetId)?.debtKrw ?? 0;
    stressedDs += r.stressed.debtServiceKrw ?? 0;
  }

  return {
    scenario,
    dscrCovenant: covenant,
    assets: results,
    portfolio: {
      baseNoiKrw: baseNoi,
      stressedNoiKrw: stressedNoi,
      baseValueKrw: baseValue,
      stressedValueKrw: stressedValue,
      debtKrw: debt,
      stressedDebtServiceKrw: stressedDs,
      stressedDscr: stressedDs > 0 ? stressedNoi / stressedDs : null,
      stressedDebtYieldPct: ratioPct(stressedNoi, debt > 0 ? debt : null),
      stressedLtvPct: ratioPct(debt, stressedValue > 0 ? stressedValue : null),
      valueChangePct: baseValue > 0 ? ((stressedValue - baseValue) / baseValue) * 100 : null
    },
    assetsBreachingDscr: results.filter((r) => r.breachesDscr).length
  };
}

/** A MonthlyAssetKpi-shaped row (Prisma `Decimal` columns arrive as Decimal/number/string). */
export type MonthlyKpiLike = {
  assetId: string;
  label?: string | null;
  noiKrw?: unknown;
  opexKrw?: unknown;
  debtOutstandingKrw?: unknown;
  debtServiceCoverage?: number | null;
  /** Value: prefer a portfolio hold value, else the asset NAV. */
  valueKrw?: unknown;
  navKrw?: unknown;
};

/**
 * Coerce MonthlyAssetKpi rows into stress inputs at the DB boundary. Rows
 * without a positive NOI and a positive value are skipped (nothing to stress).
 */
export function fromMonthlyKpis(rows: MonthlyKpiLike[]): AssetStressInput[] {
  const inputs: AssetStressInput[] = [];
  for (const r of rows) {
    const noiKrw = toNumber(r.noiKrw, 0);
    const valueKrw = toNumber(r.valueKrw ?? r.navKrw, 0);
    if (noiKrw <= 0 || valueKrw <= 0) continue;
    inputs.push({
      assetId: r.assetId,
      label: r.label ?? null,
      noiKrw,
      opexKrw: toNumberOrNull(r.opexKrw),
      valueKrw,
      debtKrw: toNumber(r.debtOutstandingKrw, 0),
      baseDscr: r.debtServiceCoverage ?? null
    });
  }
  return inputs;
}
