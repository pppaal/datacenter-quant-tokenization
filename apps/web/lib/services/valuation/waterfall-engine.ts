/**
 * Shared four-tier equity-waterfall engine.
 *
 * Both the European per-period waterfall ([`waterfall-european.ts`](./waterfall-european.ts))
 * and the American deal-by-deal waterfall ([`waterfall-american.ts`](./waterfall-american.ts))
 * run the SAME structural loop each period:
 *
 *   Tier 1. Return of Capital  — pay down outstanding capital.
 *   Tier 2. Preferred Return   — 100% to LP, up to accrued (and possibly capped) pref.
 *   Tier 3. GP Catch-Up        — 100% (optionally scaled) to GP until a catch-up target is met.
 *   Tier 4. Carry / Promote    — remaining split between LP and GP.
 *
 * The two callers differ ONLY in a handful of well-defined places:
 *
 *   (a) the catch-up TARGET formula (European: `cumLpProfit × promote/(100−promote)`;
 *       American: `cumLpPrefPaid × gpSplit/lpSplit`) — injected via `catchUpTarget`;
 *   (b) ROC allocation (European: LP-only; American: pro-rata LP+GP) — `rocMode`;
 *   (c) pref accrual math + rounding (European: rounded simple-on-(cap+pref);
 *       American: unrounded compound) — injected via `accruePref`;
 *   (d) config field names and the European-vs-American sequencing nuances
 *       (catch-up capacity scaling, pref rounding at pay time) — injected via the
 *       remaining strategy fields.
 *
 * IMPORTANT: This engine is a pure de-duplication of the tier MECHANICS and the
 * exact arithmetic / rounding ORDER of both callers. The two catch-up definitions
 * are intentionally DIVERGENT and are preserved verbatim by each caller's strategy.
 * Do not "reconcile" them here — that is a separate, behavior-changing decision.
 */

export type WaterfallRocMode = 'lp-only' | 'pro-rata';

/**
 * State exposed to the catch-up target strategy at the moment Tier 3 runs.
 * Field availability mirrors what each caller tracks today.
 */
export type CatchUpContext = {
  /** Cumulative LP *profit* (pref + carry) paid through prior periods. (European) */
  cumLpProfit: number;
  /** Cumulative GP *profit* (catch-up + carry) paid through prior periods. (European) */
  cumGpProfit: number;
  /** Cumulative LP preferred return paid through prior periods + this period. (American) */
  cumLpPrefPaid: number;
  /** Cumulative GP catch-up paid through prior periods. (American) */
  cumGpCatchupPaid: number;
  /** Pref amount paid to LP this period (Tier 2 output). (European target includes it) */
  tier2ThisPeriod: number;
};

export type WaterfallStrategy = {
  /** How Tier 1 return-of-capital is allocated. */
  rocMode: WaterfallRocMode;

  /**
   * Advance the accrued-pref balance for the period. Called once at the START of
   * each period (matching both callers, which accrue before distributing).
   * Receives the current accrued pref and outstanding LP capital; returns the
   * new accrued pref. The engine keeps the exact value the caller returns (the
   * caller owns rounding semantics).
   */
  accruePref: (accruedPref: number, lpCapitalRemaining: number) => number;

  /**
   * Convert the accrued-pref balance into the integer amount eligible to be paid
   * this period at Tier 2. European keeps it as-is (already integer); American
   * rounds. Defaults to identity.
   */
  prefPayable?: (accruedPref: number) => number;

  /**
   * Compute the cumulative GP catch-up TARGET for this period. The engine pays GP
   * up to (target − alreadyPaid). This is where each caller injects its OWN,
   * intentionally divergent catch-up definition.
   * Return 0 (or negative) to disable catch-up this period.
   */
  catchUpTarget: (ctx: CatchUpContext) => number;

  /**
   * What the running "already paid" baseline is for the catch-up shortfall.
   * European measures against cumulative GP *profit*; American against cumulative
   * GP *catch-up* only. Returns the relevant cumulative figure.
   */
  catchUpAlreadyPaid: (ctx: CatchUpContext) => number;

  /**
   * Scale the remaining distribution available to the catch-up tier. European
   * scales by `catchUpSharePct/100`; American passes 100% (identity). The result
   * is the maximum GP catch-up payable from `remaining` this period.
   */
  catchUpCapacity: (remaining: number) => number;

  /** GP share of the Tier 4 carry split. Returns GP carry given the residual. */
  carryGpShare: (residual: number) => number;

  /**
   * Whether the raw period inflow is rounded to an integer before distribution.
   * European rounds (`Math.round`); American passes the raw float through.
   * Defaults to `true` (round).
   */
  roundDistributable?: boolean;
};

export type WaterfallPeriodResult = {
  /** Distributable inflow for the period (max(0, raw)). */
  distributable: number;
  tier1Lp: number;
  tier1Gp: number;
  tier2Lp: number;
  tier3Gp: number;
  tier4Lp: number;
  tier4Gp: number;
  lpTotal: number;
  gpTotal: number;
  /** Post-period outstanding balances + accrued pref, for the caller's row. */
  lpCapitalRemaining: number;
  gpCapitalRemaining: number;
  accruedPref: number;
};

export type WaterfallEngineState = {
  lpCapitalRemaining: number;
  gpCapitalRemaining: number;
  accruedPref: number;
  /** Cumulative figures the catch-up strategies read. */
  cumLpProfit: number;
  cumGpProfit: number;
  cumLpPrefPaid: number;
  cumGpCatchupPaid: number;
};

export function initWaterfallState(lpCapital: number, gpCapital: number): WaterfallEngineState {
  return {
    lpCapitalRemaining: lpCapital,
    gpCapitalRemaining: gpCapital,
    accruedPref: 0,
    cumLpProfit: 0,
    cumGpProfit: 0,
    cumLpPrefPaid: 0,
    cumGpCatchupPaid: 0
  };
}

/**
 * Run ONE period of the four-tier waterfall. Mutates `state` in place (advancing
 * capital, pref, and cumulative trackers) and returns the per-period breakdown.
 * The arithmetic and rounding order exactly reproduce both legacy callers.
 */
export function runWaterfallPeriod(
  rawCashflow: number,
  state: WaterfallEngineState,
  strategy: WaterfallStrategy
): WaterfallPeriodResult {
  const distributable =
    strategy.roundDistributable === false
      ? Math.max(0, rawCashflow)
      : Math.max(0, Math.round(rawCashflow));

  // Accrue pref at start of period (caller owns the math + rounding).
  state.accruedPref = strategy.accruePref(state.accruedPref, state.lpCapitalRemaining);

  let remaining = distributable;
  let tier1Lp = 0;
  let tier1Gp = 0;
  let tier2Lp = 0;
  let tier3Gp = 0;
  let tier4Lp = 0;
  let tier4Gp = 0;

  // -- Tier 1: Return of Capital -------------------------------------------
  if (strategy.rocMode === 'lp-only') {
    const roc = Math.min(remaining, state.lpCapitalRemaining);
    tier1Lp += roc;
    state.lpCapitalRemaining -= roc;
    remaining -= roc;
  } else {
    const totalCapOutstanding = state.lpCapitalRemaining + state.gpCapitalRemaining;
    if (remaining > 0 && totalCapOutstanding > 0) {
      const t1 = Math.min(remaining, totalCapOutstanding);
      const t1Lp = Math.min(
        state.lpCapitalRemaining,
        Math.round(t1 * (state.lpCapitalRemaining / totalCapOutstanding))
      );
      const t1Gp = Math.min(state.gpCapitalRemaining, t1 - t1Lp);
      state.lpCapitalRemaining -= t1Lp;
      state.gpCapitalRemaining -= t1Gp;
      tier1Lp += t1Lp;
      tier1Gp += t1Gp;
      remaining -= t1Lp + t1Gp;
    }
  }

  // -- Tier 2: Preferred Return (100% LP) ----------------------------------
  if (remaining > 0 && state.accruedPref > 0) {
    const payable = strategy.prefPayable
      ? strategy.prefPayable(state.accruedPref)
      : state.accruedPref;
    const pref = Math.min(remaining, payable);
    tier2Lp += pref;
    state.accruedPref -= pref;
    state.cumLpPrefPaid += pref;
    remaining -= pref;
  }

  // -- Tier 3: GP Catch-Up -------------------------------------------------
  if (remaining > 0) {
    const ctx: CatchUpContext = {
      cumLpProfit: state.cumLpProfit,
      cumGpProfit: state.cumGpProfit,
      cumLpPrefPaid: state.cumLpPrefPaid,
      cumGpCatchupPaid: state.cumGpCatchupPaid,
      tier2ThisPeriod: tier2Lp
    };
    const target = strategy.catchUpTarget(ctx);
    const alreadyPaid = strategy.catchUpAlreadyPaid(ctx);
    const shortfall = Math.max(0, target - alreadyPaid);
    if (shortfall > 0) {
      const capacity = strategy.catchUpCapacity(remaining);
      const catchUp = Math.min(capacity, shortfall);
      tier3Gp += catchUp;
      state.cumGpCatchupPaid += catchUp;
      remaining -= catchUp;
    }
  }

  // -- Tier 4: Carry / Promote split ---------------------------------------
  if (remaining > 0) {
    const gpShare = strategy.carryGpShare(remaining);
    const lpShare = remaining - gpShare;
    tier4Lp += lpShare;
    tier4Gp += gpShare;
    remaining -= lpShare + gpShare;
  }

  const lpTotal = tier1Lp + tier2Lp + tier4Lp;
  const gpTotal = tier1Gp + tier3Gp + tier4Gp;

  // Profit trackers (ROC is not profit).
  state.cumLpProfit += tier2Lp + tier4Lp;
  state.cumGpProfit += tier3Gp + tier4Gp;

  return {
    distributable,
    tier1Lp,
    tier1Gp,
    tier2Lp,
    tier3Gp,
    tier4Lp,
    tier4Gp,
    lpTotal,
    gpTotal,
    lpCapitalRemaining: state.lpCapitalRemaining,
    gpCapitalRemaining: state.gpCapitalRemaining,
    accruedPref: state.accruedPref
  };
}

/** Run the full sequence of periods, returning the per-period breakdowns. */
export function runWaterfallTiers(
  rawCashflows: number[],
  state: WaterfallEngineState,
  strategy: WaterfallStrategy
): WaterfallPeriodResult[] {
  return rawCashflows.map((cf) => runWaterfallPeriod(cf, state, strategy));
}
