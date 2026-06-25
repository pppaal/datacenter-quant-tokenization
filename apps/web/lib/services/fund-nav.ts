/**
 * Institutional-grade fund NAV and per-LP capital-account (PCAP) primitives.
 *
 * Historically NAV across this codebase was computed as `max(called - distributed, 0)`,
 * which is a *cost-less-distributions* proxy and never reflected asset fair value
 * (gains or losses). This module centralizes a fair-value NAV — the sum of each
 * fund asset's latest valuation — and the per-LP capital-account math (committed,
 * called, distributed, unfunded, NAV share, and dated IRR/TVPI/DPI/RVPI).
 *
 * All amounts are KRW. Currency conversion (Fund.baseCurrency) is a documented
 * follow-up: today every fund in scope reports in KRW.
 *
 * This module is pure / DB-free: callers pass already-loaded fund shapes so it
 * can be unit-tested with Prisma fakes.
 */

import { Prisma } from '@prisma/client';
import { toNumber } from '@/lib/math';
import { computeXirr, type DatedCashflow } from '@/lib/finance/irr';

// XIRR + its dated-cashflow type live in the canonical IRR module; re-exported
// here so existing importers (and this module's own callers) are unchanged.
export { computeXirr };
export type { DatedCashflow };

// ---------------------------------------------------------------------------
// Number coercion (Float | Prisma.Decimal | number | null)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Fair-value NAV
// ---------------------------------------------------------------------------

/** Minimal shape of a valuation run needed to read a fair value at a date. */
export type NavValuationRun = {
  baseCaseValueKrw: number | { toNumber(): number } | null;
  createdAt: Date | string;
};

/** Minimal shape of one fund-portfolio asset for NAV purposes. */
export type NavPortfolioAsset = {
  /** Ownership held by the fund (0..100). Defaults to 100 when absent. */
  ownershipPct?: number | null;
  /** Optional explicit hold value override (already fund-share, KRW). */
  currentHoldValueKrw?: number | { toNumber(): number } | null;
  asset: {
    id?: string;
    name?: string;
    assetCode?: string;
    /** Cost basis used as a flagged fallback when no valuation exists. */
    purchasePriceKrw?: number | { toNumber(): number } | null;
    /** Latest-first list (or any order — we pick the most recent by createdAt). */
    valuations?: NavValuationRun[] | null;
  };
};

export type FundNavInput = {
  portfolio?: { assets?: NavPortfolioAsset[] | null } | null;
  /** Uncalled cash / other readily-available NAV adders (KRW). Optional. */
  otherNetAssetsKrw?: number | null;
  /** Fund-level debt to net out, if modeled (KRW, positive number). Optional. */
  fundDebtKrw?: number | null;
};

export type FundAssetNavLine = {
  assetId: string | null;
  assetName: string | null;
  assetCode: string | null;
  /** Fund-share fair value contributed to NAV (KRW). */
  fairValueKrw: number;
  /** Ownership fraction applied (0..1). */
  ownershipFraction: number;
  /** Source of the fair value: a valuation run, a cost-basis fallback, or hold-value override. */
  source: 'VALUATION' | 'COST_BASIS_FALLBACK' | 'HOLD_VALUE_OVERRIDE' | 'NONE';
  valuationDate: string | null;
};

export type FundNavResult = {
  /** Fair-value NAV (KRW): sum of asset fair values + other net assets - fund debt. */
  navKrw: number;
  /** Sum of asset fair values before other-net-assets / debt adjustments (KRW). */
  grossAssetValueKrw: number;
  otherNetAssetsKrw: number;
  fundDebtKrw: number;
  lines: FundAssetNavLine[];
  /** True when at least one asset fell back to cost basis (NAV is not fully marked). */
  usedCostBasisFallback: boolean;
  /** Asset codes/names that relied on the cost-basis fallback. */
  costBasisFallbackAssets: string[];
};

function latestValuationKrw(valuations: NavValuationRun[] | null | undefined): {
  value: number;
  date: string | null;
} | null {
  if (!valuations || valuations.length === 0) return null;
  let best: NavValuationRun | null = null;
  let bestTime = -Infinity;
  for (const run of valuations) {
    const time = new Date(run.createdAt).getTime();
    if (Number.isNaN(time)) continue;
    if (time > bestTime) {
      bestTime = time;
      best = run;
    }
  }
  if (!best) return null;
  return {
    value: toNumber(best.baseCaseValueKrw),
    date: new Date(best.createdAt).toISOString().slice(0, 10)
  };
}

/**
 * Fair-value NAV for a fund: sum over fund assets of (latest valuation × ownership),
 * with a flagged cost-basis fallback per asset, plus optional uncalled-cash/other
 * net assets and minus optional fund-level debt.
 *
 * Precedence per asset: explicit hold-value override > latest valuation run >
 * cost basis (FLAGGED) > 0.
 */
export function computeFundNavDetail(fund: FundNavInput): FundNavResult {
  const assets = fund.portfolio?.assets ?? [];
  const lines: FundAssetNavLine[] = [];
  const fallbackAssets: string[] = [];

  for (const pa of assets) {
    const ownershipPct = pa.ownershipPct == null ? 100 : pa.ownershipPct;
    const ownershipFraction = Math.max(0, ownershipPct) / 100;
    const asset = pa.asset ?? ({} as NavPortfolioAsset['asset']);

    let source: FundAssetNavLine['source'] = 'NONE';
    let fairValueFull = 0;
    let valuationDate: string | null = null;

    const holdOverride = toNumber(pa.currentHoldValueKrw);
    const latest = latestValuationKrw(asset.valuations);
    const cost = toNumber(asset.purchasePriceKrw);

    if (holdOverride > 0) {
      // Hold-value override is already a fund-share figure; do not re-apply ownership.
      source = 'HOLD_VALUE_OVERRIDE';
      lines.push({
        assetId: asset.id ?? null,
        assetName: asset.name ?? null,
        assetCode: asset.assetCode ?? null,
        fairValueKrw: holdOverride,
        ownershipFraction: 1,
        source,
        valuationDate: null
      });
      continue;
    }

    if (latest && latest.value > 0) {
      source = 'VALUATION';
      fairValueFull = latest.value;
      valuationDate = latest.date;
    } else if (cost > 0) {
      source = 'COST_BASIS_FALLBACK';
      fairValueFull = cost;
      fallbackAssets.push(asset.assetCode ?? asset.name ?? asset.id ?? 'unknown-asset');
    }

    lines.push({
      assetId: asset.id ?? null,
      assetName: asset.name ?? null,
      assetCode: asset.assetCode ?? null,
      fairValueKrw: fairValueFull * ownershipFraction,
      ownershipFraction,
      source,
      valuationDate
    });
  }

  const grossAssetValueKrw = lines.reduce((sum, l) => sum + l.fairValueKrw, 0);
  const otherNetAssetsKrw = toNumber(fund.otherNetAssetsKrw);
  const fundDebtKrw = toNumber(fund.fundDebtKrw);
  const navKrw = grossAssetValueKrw + otherNetAssetsKrw - fundDebtKrw;

  return {
    navKrw,
    grossAssetValueKrw,
    otherNetAssetsKrw,
    fundDebtKrw,
    lines,
    usedCostBasisFallback: fallbackAssets.length > 0,
    costBasisFallbackAssets: fallbackAssets
  };
}

/** Convenience wrapper returning just the NAV figure (KRW). */
export function computeFundNavKrw(fund: FundNavInput): number {
  return computeFundNavDetail(fund).navKrw;
}

// ---------------------------------------------------------------------------
// Single tokenized-asset NAV (for on-chain NAV attestation)
// ---------------------------------------------------------------------------

/** Coerce a Float | Prisma.Decimal | numeric-string to a `Prisma.Decimal`,
 *  defaulting to 0 for null/undefined/non-finite — the Decimal analogue of
 *  `toNumber`, used so the attestation path never round-trips through a lossy
 *  JS `number` before the on-chain 18-decimal scaling. */
function toDecimal(value: unknown, fallback = 0): Prisma.Decimal {
  if (value == null) return new Prisma.Decimal(fallback);
  if (value instanceof Prisma.Decimal)
    return value.isFinite() ? value : new Prisma.Decimal(fallback);
  try {
    const d = new Prisma.Decimal(value as Prisma.Decimal.Value);
    return d.isFinite() ? d : new Prisma.Decimal(fallback);
  } catch {
    return new Prisma.Decimal(fallback);
  }
}

export type TokenizedAssetNavResult = {
  /**
   * Fund-share fair value of the single asset the token represents (KRW),
   * carried as a `Prisma.Decimal` so it can be scaled to an 18-decimal
   * on-chain `uint256` without the precision loss a JS `number` incurs above
   * 2^53 KRW. This is the value the NAV attestation should sign.
   */
  navValueKrw: Prisma.Decimal;
  source: FundAssetNavLine['source'];
  ownershipFraction: number;
  valuationDate: string | null;
  usedCostBasisFallback: boolean;
};

/**
 * Fund-NAV-aware fair value for the single asset backing a tokenized asset,
 * returned as a `Prisma.Decimal`.
 *
 * This applies the SAME precedence and ownership math as
 * {@link computeFundNavDetail} (hold-value override > latest valuation ×
 * ownership > cost-basis fallback > 0) but for exactly one asset and in
 * Decimal space, so the NAV attestation signs the fund-share value the token
 * actually represents — not the raw whole-asset `baseCaseValueKrw`.
 *
 * `computeTokenizedAssetNavDetail(pa).navValueKrw.toNumber()` equals the
 * single-asset `computeFundNavDetail({ portfolio: { assets: [pa] } }).navKrw`
 * (modulo Decimal precision); the two are kept reconcilable by the
 * `nav-attestation-reconciliation` test.
 */
export function computeTokenizedAssetNavDetail(pa: NavPortfolioAsset): TokenizedAssetNavResult {
  const ownershipPct = pa.ownershipPct == null ? 100 : pa.ownershipPct;
  const ownershipFraction = Math.max(0, ownershipPct) / 100;
  const asset = pa.asset ?? ({} as NavPortfolioAsset['asset']);

  const holdOverride = toDecimal(pa.currentHoldValueKrw);
  if (holdOverride.greaterThan(0)) {
    // Hold-value override is already a fund-share figure; do not re-apply ownership.
    return {
      navValueKrw: holdOverride,
      source: 'HOLD_VALUE_OVERRIDE',
      ownershipFraction: 1,
      valuationDate: null,
      usedCostBasisFallback: false
    };
  }

  const latest = latestValuationKrw(asset.valuations);
  if (latest && latest.value > 0) {
    return {
      navValueKrw: toDecimal(latest.value).mul(ownershipFraction),
      source: 'VALUATION',
      ownershipFraction,
      valuationDate: latest.date,
      usedCostBasisFallback: false
    };
  }

  const cost = toDecimal(asset.purchasePriceKrw);
  if (cost.greaterThan(0)) {
    return {
      navValueKrw: cost.mul(ownershipFraction),
      source: 'COST_BASIS_FALLBACK',
      ownershipFraction,
      valuationDate: null,
      usedCostBasisFallback: true
    };
  }

  return {
    navValueKrw: new Prisma.Decimal(0),
    source: 'NONE',
    ownershipFraction,
    valuationDate: null,
    usedCostBasisFallback: false
  };
}

// ---------------------------------------------------------------------------
// Per-LP capital account (PCAP)
// ---------------------------------------------------------------------------

// Local time constants used by the PCAP fallback below. (XIRR itself uses its
// own act/365 constants inside the canonical IRR module.)
const DAYS_PER_YEAR = 365;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type PcapCommitment = {
  investorId: string;
  investorCode?: string | null;
  investorName?: string | null;
  investorType?: string | null;
  commitmentKrw: number | { toNumber(): number };
  calledKrw: number | { toNumber(): number };
  distributedKrw: number | { toNumber(): number };
  recallableKrw?: number | { toNumber(): number } | null;
  signedAt?: Date | string | null;
};

export type PcapFundCashflow = {
  date: Date | string;
  amountKrw: number | { toNumber(): number };
  /** Optional per-investor allocation; when absent, allocated pro-rata by commitment. */
  investorId?: string | null;
};

export type LpStatement = {
  investorId: string;
  investorCode: string | null;
  investorName: string | null;
  investorType: string | null;
  committedKrw: number;
  calledKrw: number;
  distributedKrw: number;
  unfundedKrw: number;
  recallableKrw: number;
  /** This LP's pro-rata share of fund NAV (KRW). */
  navShareKrw: number;
  /** Ownership share of the fund by commitment (0..100). */
  sharePct: number;
  irrPct: number | null;
  tvpiMultiple: number;
  dpiMultiple: number;
  rvpiMultiple: number;
  /** True when this LP's cashflow timing was allocated pro-rata (fund-level events). */
  cashflowsAllocatedProRata: boolean;
};

export type PcapResult = {
  navKrw: number;
  navUsedCostBasisFallback: boolean;
  navCostBasisFallbackAssets: string[];
  totals: {
    committedKrw: number;
    calledKrw: number;
    distributedKrw: number;
    unfundedKrw: number;
    recallableKrw: number;
    navShareKrw: number;
    tvpiMultiple: number;
    dpiMultiple: number;
    rvpiMultiple: number;
    irrPct: number | null;
  };
  investors: LpStatement[];
};

function multiple(numerator: number, denominator: number): number {
  return denominator > 0 ? Number((numerator / denominator).toFixed(4)) : 0;
}

/**
 * Residual value an LP carries cannot be negative under limited liability — a
 * mark-to-market loss drives the multiple below 1x, it does not produce a
 * *negative* RVPI/TVPI. Floor the NAV (residual value) contribution at 0 so the
 * reported multiples stay >= 0; the loss is already reflected by TVPI < 1.
 */
function residualValue(navKrw: number): number {
  return Math.max(navKrw, 0);
}

/**
 * Build per-LP capital-account statements plus a fund-level rollup.
 *
 * NAV is the fair-value NAV from `computeFundNavDetail`. Each LP's NAV share is
 * pro-rata by commitment (no units/ownership column exists on Commitment yet —
 * documented interim).
 *
 * Cashflow timing for IRR:
 *  - If capital calls / distributions carry an `investorId`, that LP's flows are
 *    used directly.
 *  - Otherwise (fund-level events) they are allocated pro-rata by commitment.
 *    This is documented as an interim until per-LP allocation rows exist.
 *
 * Per-LP IRR is XIRR over dated (−called, +distributed) flows plus the LP's
 * ending NAV share as a terminal positive flow at `asOf`.
 */
export function buildPcap(params: {
  commitments: PcapCommitment[];
  fundCapitalCalls: PcapFundCashflow[];
  fundDistributions: PcapFundCashflow[];
  nav: FundNavResult;
  asOf?: Date;
}): PcapResult {
  const asOf = params.asOf ?? new Date();
  const nav = params.nav;

  const totalCommitted = params.commitments.reduce((s, c) => s + toNumber(c.commitmentKrw), 0);

  // Determine whether cashflows are per-investor or fund-level.
  const callsHaveInvestor = params.fundCapitalCalls.some((c) => c.investorId != null);
  const distrosHaveInvestor = params.fundDistributions.some((d) => d.investorId != null);

  const investors: LpStatement[] = params.commitments.map((commitment) => {
    const committedKrw = toNumber(commitment.commitmentKrw);
    const calledKrw = toNumber(commitment.calledKrw);
    const distributedKrw = toNumber(commitment.distributedKrw);
    const recallableKrw = toNumber(commitment.recallableKrw);
    const sharePct = totalCommitted > 0 ? (committedKrw / totalCommitted) * 100 : 0;
    const shareFraction = totalCommitted > 0 ? committedKrw / totalCommitted : 0;
    const navShareKrw = nav.navKrw * shareFraction;

    // Assemble this LP's dated cashflows for XIRR.
    const lpFlows: DatedCashflow[] = [];

    const calls = callsHaveInvestor
      ? params.fundCapitalCalls.filter((c) => c.investorId === commitment.investorId)
      : params.fundCapitalCalls.map((c) => ({
          ...c,
          amountKrw: toNumber(c.amountKrw) * shareFraction
        }));
    for (const c of calls) {
      lpFlows.push({ date: new Date(c.date), amountKrw: -Math.abs(toNumber(c.amountKrw)) });
    }

    const distros = distrosHaveInvestor
      ? params.fundDistributions.filter((d) => d.investorId === commitment.investorId)
      : params.fundDistributions.map((d) => ({
          ...d,
          amountKrw: toNumber(d.amountKrw) * shareFraction
        }));
    for (const d of distros) {
      lpFlows.push({ date: new Date(d.date), amountKrw: Math.abs(toNumber(d.amountKrw)) });
    }

    // Terminal NAV share as a positive flow at the valuation date.
    if (navShareKrw !== 0) {
      lpFlows.push({ date: asOf, amountKrw: navShareKrw });
    }

    // When dated events are unavailable, fall back to commitment-level
    // (called/distributed) cashflows anchored at signing/now so IRR is still defined.
    const hasDatedCalls = lpFlows.some((f) => f.amountKrw < 0);
    let irrFlows = lpFlows;
    if (!hasDatedCalls && calledKrw > 0) {
      const anchor = commitment.signedAt ? new Date(commitment.signedAt) : asOf;
      irrFlows = [
        { date: anchor, amountKrw: -calledKrw },
        ...(distributedKrw > 0 ? [{ date: asOf, amountKrw: distributedKrw }] : []),
        ...(navShareKrw !== 0 ? [{ date: asOf, amountKrw: navShareKrw }] : [])
      ];
    }

    const irrPct = computeXirr(irrFlows);

    const dpiMultiple = multiple(distributedKrw, calledKrw);
    const rvpiMultiple = multiple(residualValue(navShareKrw), calledKrw);
    const tvpiMultiple = multiple(distributedKrw + residualValue(navShareKrw), calledKrw);

    return {
      investorId: commitment.investorId,
      investorCode: commitment.investorCode ?? null,
      investorName: commitment.investorName ?? null,
      investorType: commitment.investorType ?? null,
      committedKrw,
      calledKrw,
      distributedKrw,
      unfundedKrw: Math.max(committedKrw - calledKrw, 0),
      recallableKrw,
      navShareKrw,
      sharePct: Number(sharePct.toFixed(4)),
      irrPct,
      tvpiMultiple,
      dpiMultiple,
      rvpiMultiple,
      cashflowsAllocatedProRata: !(callsHaveInvestor || distrosHaveInvestor)
    };
  });

  const sum = (pick: (s: LpStatement) => number) => investors.reduce((s2, i) => s2 + pick(i), 0);
  const totalCalled = sum((i) => i.calledKrw);
  const totalDistributed = sum((i) => i.distributedKrw);
  const totalNavShare = sum((i) => i.navShareKrw);

  // Fund-level IRR: aggregate dated calls (−) + distributions (+) + ending NAV.
  const fundFlows: DatedCashflow[] = [
    ...params.fundCapitalCalls.map((c) => ({
      date: new Date(c.date),
      amountKrw: -Math.abs(toNumber(c.amountKrw))
    })),
    ...params.fundDistributions.map((d) => ({
      date: new Date(d.date),
      amountKrw: Math.abs(toNumber(d.amountKrw))
    }))
  ];
  if (nav.navKrw !== 0) fundFlows.push({ date: asOf, amountKrw: nav.navKrw });
  let fundIrrPct = computeXirr(fundFlows);
  if (fundIrrPct == null && totalCalled > 0) {
    // Undated fallback so the rollup is still informative.
    fundIrrPct = computeXirr([
      { date: new Date(asOf.getTime() - DAYS_PER_YEAR * MS_PER_DAY), amountKrw: -totalCalled },
      { date: asOf, amountKrw: totalDistributed + nav.navKrw }
    ]);
  }

  return {
    navKrw: nav.navKrw,
    navUsedCostBasisFallback: nav.usedCostBasisFallback,
    navCostBasisFallbackAssets: nav.costBasisFallbackAssets,
    totals: {
      committedKrw: totalCommitted,
      calledKrw: totalCalled,
      distributedKrw: totalDistributed,
      unfundedKrw: sum((i) => i.unfundedKrw),
      recallableKrw: sum((i) => i.recallableKrw),
      navShareKrw: totalNavShare,
      tvpiMultiple: multiple(totalDistributed + residualValue(totalNavShare), totalCalled),
      dpiMultiple: multiple(totalDistributed, totalCalled),
      rvpiMultiple: multiple(residualValue(totalNavShare), totalCalled),
      irrPct: fundIrrPct
    },
    investors
  };
}
