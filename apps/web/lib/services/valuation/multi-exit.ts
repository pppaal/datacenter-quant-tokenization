/**
 * Multi-exit scenario comparator — enumerates Korean CRE exit archetypes
 * and ranks them on NPV of net-to-equity proceeds.
 *
 * Archetypes modelled:
 *
 *   1. BULK_SALE (일괄매각) — baseline. Single transaction at exit cap rate.
 *      Proceeds = NOI / exitCap, less broker fee, exit capital-gains tax on
 *      gain, and debt payoff.
 *
 *   2. STRATA_SALE (분양) — floor-by-floor retail sale over a 2-3 year
 *      sell-down. Gross premium of ~15-25% over bulk (small-ticket buyers
 *      pay up) but loses to:
 *         • sell-down period (cashflow timing discount)
 *         • VAT on building portion (10%, partially recoverable)
 *         • higher broker / marketing friction (5-8% vs 1-2%)
 *         • unsold-inventory risk (haircut if absorption stalls)
 *
 *   3. REIT_SEED (공모리츠 IPO) — contribute to a REIT vehicle at a valuation
 *      pegged to dividend-yield cap. Typically 4.5-5.5% implied cap (thinner
 *      than private-market cap) → proceeds uplift, BUT sponsor retains
 *      sub-25% residual and receives units (partial liquidity). We model the
 *      cash-out portion at REIT pricing, residual at book.
 *
 *   4. REFI_HOLD (재조달 후 계속보유) — no sale. Refinance to target LTV,
 *      extract excess proceeds, continue to operate. Modelled as:
 *         • refi proceeds = new_LTV × implied value − existing debt
 *         • plus DCF of post-refi NOI stream for N more years (discounted)
 *         • residual value stays in asset, not monetized yet.
 *
 * Output: per-scenario proceeds, timing, discounted NPV to equity, plus
 * which scenario wins on NPV and what the decision rationale is.
 */

export type MultiExitScenarioKey =
  | 'BULK_SALE'
  | 'STRATA_SALE'
  | 'REIT_SEED'
  | 'REFI_HOLD';

export type MultiExitInput = {
  /** Stabilized annual NOI (KRW) at exit year. */
  stabilizedNoiKrw: number;
  /** Market exit cap rate (pct, e.g. 5.5). Used for BULK_SALE valuation. */
  exitCapRatePct: number;
  gfaSqm: number;
  /** Outstanding debt at exit (KRW). Netted from equity proceeds. */
  outstandingDebtKrw: number;
  /** Book cost basis for tax gain calc. */
  bookBasisKrw: number;
  /** Exit year from underwriting. */
  exitYear: number;
  /** Discount rate for NPV computation (pct). Typically = investor's hurdle. */
  discountRatePct: number;
  /** Corporate capital-gains rate (pct). Default 20%. */
  corporateTaxPct?: number;
  /**
   * Whether the asset is divisible for strata sale. FALSE for single-tenant
   * logistics, most DCs, land. TRUE for office, retail, multi-family.
   */
  strataEligible: boolean;
  /**
   * Whether the sponsor is in a position to seed a REIT — requires portfolio
   * scale or co-sponsor relationship. FALSE for one-off assets.
   */
  reitSeedEligible: boolean;
};

export type ExitScenarioResult = {
  scenario: MultiExitScenarioKey;
  labelKo: string;
  grossProceedsKrw: number;
  frictionKrw: number;          // broker + legal + VAT net
  taxKrw: number;
  debtPayoffKrw: number;
  netToEquityKrw: number;
  /** Years from now (underwriting exit year) until cash is received, weighted. */
  weightedReceiptYearOffset: number;
  /** NPV of net-to-equity cash inflows, discounted to underwriting year 0. */
  npvKrw: number;
  feasible: boolean;
  infeasibilityReason: string | null;
  notes: string[];
};

export type MultiExitComparison = {
  scenarios: ExitScenarioResult[];
  winner: MultiExitScenarioKey;
  winnerRationale: string;
  /** NPV gap between winner and median (useful to surface "convincing vs marginal" calls). */
  marginalityKrw: number;
};

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const DEFAULT_CORP_TAX_PCT = 20;

function discount(amount: number, yearOffset: number, discountRatePct: number): number {
  return amount / Math.pow(1 + discountRatePct / 100, yearOffset);
}

function gain(proceeds: number, basis: number): number {
  return Math.max(0, proceeds - basis);
}

// ---------------------------------------------------------------------------
// Scenario 1 — BULK_SALE
// ---------------------------------------------------------------------------

const BULK_BROKER_FEE_PCT = 1.5;

function scenarioBulkSale(input: MultiExitInput): ExitScenarioResult {
  const corp = input.corporateTaxPct ?? DEFAULT_CORP_TAX_PCT;
  const grossProceeds = input.stabilizedNoiKrw / (input.exitCapRatePct / 100);
  const brokerFee = grossProceeds * (BULK_BROKER_FEE_PCT / 100);
  const taxableGain = gain(grossProceeds - brokerFee, input.bookBasisKrw);
  const tax = taxableGain * (corp / 100);
  const netToEquity = grossProceeds - brokerFee - tax - input.outstandingDebtKrw;
  const npv = discount(netToEquity, input.exitYear, input.discountRatePct);

  return {
    scenario: 'BULK_SALE',
    labelKo: '일괄매각',
    grossProceedsKrw: Math.round(grossProceeds),
    frictionKrw: Math.round(brokerFee),
    taxKrw: Math.round(tax),
    debtPayoffKrw: input.outstandingDebtKrw,
    netToEquityKrw: Math.round(netToEquity),
    weightedReceiptYearOffset: input.exitYear,
    npvKrw: Math.round(npv),
    feasible: true,
    infeasibilityReason: null,
    notes: ['Baseline exit at market cap rate; single counter-party settlement.']
  };
}

// ---------------------------------------------------------------------------
// Scenario 2 — STRATA_SALE (분양)
// ---------------------------------------------------------------------------

const STRATA_GROSS_PREMIUM_PCT = 18;     // Retail buyers pay up vs institutional cap rate
const STRATA_MARKETING_FEE_PCT = 6;
const STRATA_VAT_PCT = 10;
const STRATA_BUILDING_SHARE_PCT = 60;    // Building portion subject to VAT; land exempt
const STRATA_SELL_DOWN_YEARS = 3;        // 30% year 1, 45% year 2, 25% year 3

function scenarioStrataSale(input: MultiExitInput): ExitScenarioResult {
  if (!input.strataEligible) {
    return {
      scenario: 'STRATA_SALE',
      labelKo: '분양 (구분매각)',
      grossProceedsKrw: 0,
      frictionKrw: 0,
      taxKrw: 0,
      debtPayoffKrw: 0,
      netToEquityKrw: 0,
      weightedReceiptYearOffset: input.exitYear,
      npvKrw: Number.NEGATIVE_INFINITY,
      feasible: false,
      infeasibilityReason: 'Asset is not strata-divisible (single tenant or indivisible use).',
      notes: []
    };
  }
  const corp = input.corporateTaxPct ?? DEFAULT_CORP_TAX_PCT;
  const bulkProceeds = input.stabilizedNoiKrw / (input.exitCapRatePct / 100);
  const grossProceeds = bulkProceeds * (1 + STRATA_GROSS_PREMIUM_PCT / 100);

  const marketingFee = grossProceeds * (STRATA_MARKETING_FEE_PCT / 100);
  // VAT applies on building portion. For CORP seller this is collected & remitted,
  // NOT net-negative to equity (buyers pay it and seller remits), BUT unsold
  // inventory leaves VAT carry → haircut. Model as 20% of full VAT nominal.
  const vatNominal = grossProceeds * (STRATA_BUILDING_SHARE_PCT / 100) * (STRATA_VAT_PCT / 100);
  const vatFriction = vatNominal * 0.2;

  const friction = marketingFee + vatFriction;
  const taxableGain = gain(grossProceeds - friction, input.bookBasisKrw);
  const tax = taxableGain * (corp / 100);
  const netToEquity = grossProceeds - friction - tax - input.outstandingDebtKrw;

  // Sell-down timing: 30/45/25 over years (exit+0, +1, +2) → weighted offset.
  const absorption = [0.3, 0.45, 0.25];
  let weightedOffset = 0;
  let npv = 0;
  for (let i = 0; i < absorption.length; i++) {
    const yearOffset = input.exitYear + i;
    weightedOffset += absorption[i]! * yearOffset;
    npv += discount(netToEquity * absorption[i]!, yearOffset, input.discountRatePct);
  }

  return {
    scenario: 'STRATA_SALE',
    labelKo: '분양 (구분매각)',
    grossProceedsKrw: Math.round(grossProceeds),
    frictionKrw: Math.round(friction),
    taxKrw: Math.round(tax),
    debtPayoffKrw: input.outstandingDebtKrw,
    netToEquityKrw: Math.round(netToEquity),
    weightedReceiptYearOffset: Number(weightedOffset.toFixed(2)),
    npvKrw: Math.round(npv),
    feasible: true,
    infeasibilityReason: null,
    notes: [
      `Gross premium ${STRATA_GROSS_PREMIUM_PCT}% vs bulk cap — retail demand premium.`,
      `Sell-down over ${STRATA_SELL_DOWN_YEARS}y absorbs at 30/45/25 weights.`,
      `VAT carry on unsold inventory assumed to haircut 20% of nominal VAT.`
    ]
  };
}

// ---------------------------------------------------------------------------
// Scenario 3 — REIT_SEED
// ---------------------------------------------------------------------------

const REIT_IMPLIED_CAP_SPREAD_PCT = -1.0;   // REIT valuation 100bps thinner than market
const REIT_CASH_OUT_SHARE_PCT = 75;          // Sponsor keeps 25% units
const REIT_LISTING_FRICTION_PCT = 3;         // Underwriter, legal, marketing
const REIT_RESIDUAL_UNIT_DISCOUNT_PCT = 15;  // illiquidity / lockup mark

function scenarioReitSeed(input: MultiExitInput): ExitScenarioResult {
  if (!input.reitSeedEligible) {
    return {
      scenario: 'REIT_SEED',
      labelKo: 'REIT 상장 시드',
      grossProceedsKrw: 0,
      frictionKrw: 0,
      taxKrw: 0,
      debtPayoffKrw: 0,
      netToEquityKrw: 0,
      weightedReceiptYearOffset: input.exitYear,
      npvKrw: Number.NEGATIVE_INFINITY,
      feasible: false,
      infeasibilityReason: 'No REIT seed pathway available (no portfolio scale or sponsor).',
      notes: []
    };
  }
  const corp = input.corporateTaxPct ?? DEFAULT_CORP_TAX_PCT;
  const reitCap = Math.max(3.5, input.exitCapRatePct + REIT_IMPLIED_CAP_SPREAD_PCT);
  const reitValuation = input.stabilizedNoiKrw / (reitCap / 100);
  const listingFee = reitValuation * (REIT_LISTING_FRICTION_PCT / 100);

  const cashOut = reitValuation * (REIT_CASH_OUT_SHARE_PCT / 100);
  const residualUnits = reitValuation * (1 - REIT_CASH_OUT_SHARE_PCT / 100);
  const markedUnits = residualUnits * (1 - REIT_RESIDUAL_UNIT_DISCOUNT_PCT / 100);
  const grossToSponsor = cashOut + markedUnits;

  const taxableGain = gain(cashOut - listingFee, input.bookBasisKrw * (REIT_CASH_OUT_SHARE_PCT / 100));
  const tax = taxableGain * (corp / 100);
  const netToEquity = grossToSponsor - listingFee - tax - input.outstandingDebtKrw;

  // Cash-out comes at exit. Residual unit value realized over a ~2yr lockup →
  // approximate as half at exit year, half at exit+2.
  const npv =
    discount((cashOut - listingFee - tax) * 0.5 + markedUnits * 0.5, input.exitYear, input.discountRatePct) +
    discount((cashOut - listingFee - tax) * 0.5 + markedUnits * 0.5, input.exitYear + 2, input.discountRatePct) -
    discount(input.outstandingDebtKrw, input.exitYear, input.discountRatePct);

  return {
    scenario: 'REIT_SEED',
    labelKo: 'REIT 상장 시드',
    grossProceedsKrw: Math.round(grossToSponsor),
    frictionKrw: Math.round(listingFee),
    taxKrw: Math.round(tax),
    debtPayoffKrw: input.outstandingDebtKrw,
    netToEquityKrw: Math.round(netToEquity),
    weightedReceiptYearOffset: input.exitYear + 1,
    npvKrw: Math.round(npv),
    feasible: true,
    infeasibilityReason: null,
    notes: [
      `REIT priced at ${reitCap.toFixed(2)}% cap (${Math.abs(REIT_IMPLIED_CAP_SPREAD_PCT)}pp tighter than private market).`,
      `Sponsor retains ${100 - REIT_CASH_OUT_SHARE_PCT}% in units, marked to ${100 - REIT_RESIDUAL_UNIT_DISCOUNT_PCT}% NAV.`,
      `Lockup split: 50% at list, 50% at +2yr.`
    ]
  };
}

// ---------------------------------------------------------------------------
// Scenario 4 — REFI_HOLD
// ---------------------------------------------------------------------------

const REFI_TARGET_LTV_PCT = 65;
const REFI_CLOSING_COST_PCT = 1.0;
const REFI_EXTEND_HOLD_YEARS = 5;

function scenarioRefiHold(input: MultiExitInput): ExitScenarioResult {
  const impliedValue = input.stabilizedNoiKrw / (input.exitCapRatePct / 100);
  const newDebt = impliedValue * (REFI_TARGET_LTV_PCT / 100);
  const refiProceeds = Math.max(0, newDebt - input.outstandingDebtKrw);
  const closingCost = newDebt * (REFI_CLOSING_COST_PCT / 100);
  const netRefi = refiProceeds - closingCost;

  // Post-refi NOI stream, 5 extra years, flat. No gain tax on refi.
  let npv = discount(netRefi, input.exitYear, input.discountRatePct);
  for (let t = 1; t <= REFI_EXTEND_HOLD_YEARS; t++) {
    // Simplified: assume NOI minus new debt service (rough 6% interest, interest-only).
    const interestCost = newDebt * 0.06;
    const afterDebtNoi = Math.max(0, input.stabilizedNoiKrw - interestCost);
    npv += discount(afterDebtNoi, input.exitYear + t, input.discountRatePct);
  }
  // Terminal value of asset minus remaining debt at end of extended hold (still cap'd at same rate).
  const terminalValue = impliedValue;
  const terminalNetOfDebt = terminalValue - newDebt;
  npv += discount(terminalNetOfDebt, input.exitYear + REFI_EXTEND_HOLD_YEARS, input.discountRatePct);

  return {
    scenario: 'REFI_HOLD',
    labelKo: '재조달 후 계속보유',
    grossProceedsKrw: Math.round(netRefi + terminalNetOfDebt),
    frictionKrw: Math.round(closingCost),
    taxKrw: 0,
    debtPayoffKrw: input.outstandingDebtKrw,
    netToEquityKrw: Math.round(netRefi + terminalNetOfDebt),
    weightedReceiptYearOffset: input.exitYear + REFI_EXTEND_HOLD_YEARS / 2,
    npvKrw: Math.round(npv),
    feasible: true,
    infeasibilityReason: null,
    notes: [
      `Refi to ${REFI_TARGET_LTV_PCT}% LTV unlocks ${Math.round(netRefi / 1_000_000_000)}bn KRW cash, defers gains tax.`,
      `Extends hold by ${REFI_EXTEND_HOLD_YEARS} years with post-debt NOI carry.`,
      `Terminal sale at end of extended hold cap'd at same market rate.`
    ]
  };
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

export function compareExitScenarios(input: MultiExitInput): MultiExitComparison {
  const scenarios = [
    scenarioBulkSale(input),
    scenarioStrataSale(input),
    scenarioReitSeed(input),
    scenarioRefiHold(input)
  ];

  const feasible = scenarios.filter((s) => s.feasible);
  const winner = feasible.reduce((best, s) => (s.npvKrw > best.npvKrw ? s : best));

  const sorted = [...feasible].sort((a, b) => b.npvKrw - a.npvKrw);
  const median = sorted[Math.floor(sorted.length / 2)]!;
  const marginality = winner.npvKrw - median.npvKrw;

  const runnerUp = sorted[1];
  const winnerRationale = runnerUp
    ? `${winner.labelKo} (${winner.scenario}) wins on NPV by ${Math.round(
        (winner.npvKrw - runnerUp.npvKrw) / 1_000_000_000
      )}bn KRW over ${runnerUp.labelKo}.`
    : `${winner.labelKo} is the only feasible path.`;

  return {
    scenarios,
    winner: winner.scenario,
    winnerRationale,
    marginalityKrw: Math.round(marginality)
  };
}
