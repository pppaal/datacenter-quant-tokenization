/**
 * USD/KRW FX hedge overlay for pro-forma cash flows.
 *
 * Why this module exists:
 *   Korean commercial-property deals quote IRR in KRW. For USD-based LPs
 *   (the typical offshore co-investor), KRW IRR hides FX risk — a 7% KRW IRR
 *   can turn into a 3% USD IRR if KRW depreciates 4%/yr. This layer:
 *
 *     1. Converts the KRW distribution schedule + exit proceeds to USD
 *        under an assumed spot path.
 *     2. Prices a hedge strategy (NDF forward rolls, or exit-only hedge)
 *        using the interest-rate-differential-implied forward premium.
 *     3. Reports unhedged vs hedged USD IRR, the hedge P&L, and remaining
 *        basis risk.
 *
 * Simplifying assumptions (explicit so they can be challenged):
 *   - Forward premium is flat (single annual rate) — good enough for
 *     10y horizon underwriting; more precise curves belong in a live-market
 *     data layer, not in a valuation stub.
 *   - No option strategies yet. A collar would need vol / strike inputs we
 *     don't carry. Forwards get us 80% of the LP conversation.
 *   - Hedge ratio applies uniformly to every cash flow.
 */

export type HedgeStrategy =
  | 'NONE'
  | 'ROLLING_FORWARDS'
  | 'EXIT_ONLY_NDF';

export type FxHedgeInput = {
  /** Per-year KRW distributions to equity. Year 0 = acquisition equity outlay (negative). */
  cashflowsKrw: Array<{ year: number; krwAmount: number }>;
  /** Final-year exit proceeds (KRW). Added separately so we can mark the hedge at exit. */
  exitProceedsKrw: number;
  exitYear: number;

  /** Starting USD/KRW spot (e.g., 1380). */
  spotUsdKrw: number;
  /** Per-year KRW depreciation assumption (positive = KRW weakens). */
  annualKrwDepreciationPct: number;
  /**
   * Annualized forward premium for selling KRW / buying USD forward.
   * Positive = USD is at a premium (hedge is costly). Historically KRW > USD
   * rates so this is usually in the 1-2% range — represents KRW IRS minus USD
   * IRS at matched tenor.
   */
  annualKrwForwardPremiumPct: number;

  hedgeStrategy: HedgeStrategy;
  /** 0-100 fraction of exposure to hedge. Ignored when strategy is NONE. */
  hedgeRatioPct: number;
};

export type FxHedgeYearRow = {
  year: number;
  krwAmount: number;
  /** Spot rate projected for this year. */
  spotUsdKrw: number;
  /** Forward rate locked in for converting this year's flow (when hedged). */
  hedgedUsdKrw: number | null;
  /** Unhedged USD equivalent (krwAmount / spot). */
  unhedgedUsd: number;
  /** Hedged USD equivalent — blends hedge ratio between hedgedRate and spot. */
  hedgedUsd: number;
  /** Per-year hedge P&L vs spot (hedged − unhedged). Negative means hedge cost carry. */
  hedgePnlUsd: number;
};

export type FxHedgeResult = {
  strategy: HedgeStrategy;
  years: FxHedgeYearRow[];
  unhedgedIrrUsd: number | null;
  hedgedIrrUsd: number | null;
  krwIrr: number | null;
  /** Sum of per-year hedge P&L across hold (USD). */
  totalHedgePnlUsd: number;
  /** Terminal KRW depreciation vs start (%). Positive = KRW weaker at exit. */
  terminalKrwDepreciationPct: number;
  notes: string[];
};

// ---------------------------------------------------------------------------
// IRR — Newton-bisection hybrid, reused pattern
// ---------------------------------------------------------------------------

function npv(rate: number, flows: number[]): number {
  let sum = 0;
  for (let i = 0; i < flows.length; i++) {
    sum += flows[i]! / Math.pow(1 + rate, i);
  }
  return sum;
}

function solveIrr(flows: number[]): number | null {
  if (flows.length < 2) return null;
  if (!flows.some((f) => f > 0) || !flows.some((f) => f < 0)) return null;
  let lo = -0.99;
  let hi = 10;
  let loV = npv(lo, flows);
  let hiV = npv(hi, flows);
  if (loV * hiV > 0) return null;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    const midV = npv(mid, flows);
    if (Math.abs(midV) < 1e-6) return mid;
    if (loV * midV < 0) {
      hi = mid;
      hiV = midV;
    } else {
      lo = mid;
      loV = midV;
    }
  }
  return (lo + hi) / 2;
}

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

function projectSpot(spot0: number, annualDepreciationPct: number, year: number): number {
  // year 0 = spot; KRW weakens by `annualDepreciationPct` each year.
  return spot0 * Math.pow(1 + annualDepreciationPct / 100, year);
}

function forwardRate(
  spot0: number,
  annualPremiumPct: number,
  year: number
): number {
  // Covered-interest-parity-style projection: F_t = S_0 × (1 + premium)^t
  // Interpreted as the rate to SELL KRW forward in year t.
  return spot0 * Math.pow(1 + annualPremiumPct / 100, year);
}

export function applyFxHedge(input: FxHedgeInput): FxHedgeResult {
  const ratio = Math.min(1, Math.max(0, input.hedgeRatioPct / 100));
  const notes: string[] = [];

  const mergedByYear = new Map<number, number>();
  for (const cf of input.cashflowsKrw) {
    mergedByYear.set(cf.year, (mergedByYear.get(cf.year) ?? 0) + cf.krwAmount);
  }
  mergedByYear.set(
    input.exitYear,
    (mergedByYear.get(input.exitYear) ?? 0) + input.exitProceedsKrw
  );

  const orderedYears = [...mergedByYear.keys()].sort((a, b) => a - b);
  const rows: FxHedgeYearRow[] = [];

  for (const year of orderedYears) {
    const krwAmount = mergedByYear.get(year)!;
    const spot = projectSpot(input.spotUsdKrw, input.annualKrwDepreciationPct, year);
    const unhedgedUsd = krwAmount / spot;

    let hedgedRate: number | null = null;
    let hedgedUsd = unhedgedUsd;
    if (input.hedgeStrategy === 'ROLLING_FORWARDS') {
      hedgedRate = forwardRate(input.spotUsdKrw, input.annualKrwForwardPremiumPct, year);
      const atHedge = krwAmount / hedgedRate;
      hedgedUsd = atHedge * ratio + unhedgedUsd * (1 - ratio);
    } else if (input.hedgeStrategy === 'EXIT_ONLY_NDF') {
      if (year === input.exitYear) {
        hedgedRate = forwardRate(input.spotUsdKrw, input.annualKrwForwardPremiumPct, year);
        const atHedge = krwAmount / hedgedRate;
        hedgedUsd = atHedge * ratio + unhedgedUsd * (1 - ratio);
      }
    }

    rows.push({
      year,
      krwAmount,
      spotUsdKrw: Number(spot.toFixed(2)),
      hedgedUsdKrw: hedgedRate === null ? null : Number(hedgedRate.toFixed(2)),
      unhedgedUsd: Math.round(unhedgedUsd),
      hedgedUsd: Math.round(hedgedUsd),
      hedgePnlUsd: Math.round(hedgedUsd - unhedgedUsd)
    });
  }

  // IRRs — rebuild zero-anchored flow arrays (index = elapsed years from first).
  const minYear = orderedYears[0] ?? 0;
  const maxYear = orderedYears[orderedYears.length - 1] ?? 0;
  const krwFlows: number[] = [];
  const unhedgedFlows: number[] = [];
  const hedgedFlows: number[] = [];
  for (let y = minYear; y <= maxYear; y++) {
    const row = rows.find((r) => r.year === y);
    krwFlows.push(row?.krwAmount ?? 0);
    unhedgedFlows.push(row?.unhedgedUsd ?? 0);
    hedgedFlows.push(row?.hedgedUsd ?? 0);
  }

  const krwIrr = solveIrr(krwFlows);
  const unhedgedIrrUsd = solveIrr(unhedgedFlows);
  const hedgedIrrUsd = input.hedgeStrategy === 'NONE' ? unhedgedIrrUsd : solveIrr(hedgedFlows);

  const totalHedgePnl = rows.reduce((s, r) => s + r.hedgePnlUsd, 0);
  const terminalSpot = projectSpot(input.spotUsdKrw, input.annualKrwDepreciationPct, input.exitYear);
  const terminalDeprec = ((terminalSpot - input.spotUsdKrw) / input.spotUsdKrw) * 100;

  if (input.annualKrwDepreciationPct > 0 && input.hedgeStrategy === 'NONE') {
    notes.push(
      `Unhedged: KRW weakens ${input.annualKrwDepreciationPct}%/yr → ${terminalDeprec.toFixed(1)}% total drag on USD IRR.`
    );
  }
  if (input.hedgeStrategy === 'ROLLING_FORWARDS') {
    notes.push(
      `Rolling forwards at ${input.annualKrwForwardPremiumPct}% premium caps FX upside but pays ~${input.annualKrwForwardPremiumPct}%/yr carry.`
    );
  }
  if (input.hedgeStrategy === 'EXIT_ONLY_NDF') {
    notes.push(
      `Exit-only NDF hedges the lump-sum proceeds but leaves interim distributions exposed to spot.`
    );
  }
  if (ratio < 1 && input.hedgeStrategy !== 'NONE') {
    notes.push(`Partial hedge (${(ratio * 100).toFixed(0)}% ratio) — residual spot exposure retained.`);
  }

  return {
    strategy: input.hedgeStrategy,
    years: rows,
    unhedgedIrrUsd,
    hedgedIrrUsd,
    krwIrr,
    totalHedgePnlUsd: Math.round(totalHedgePnl),
    terminalKrwDepreciationPct: Number(terminalDeprec.toFixed(2)),
    notes
  };
}
