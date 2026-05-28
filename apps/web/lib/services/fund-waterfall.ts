import type { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';

export type FundWaterfallInvestorRow = {
  investorId: string;
  investorCode: string;
  investorName: string;
  investorType: string | null;
  committedKrw: number;
  calledKrw: number;
  distributedKrw: number;
  remainingCommitmentKrw: number;
  sharePct: number;
  statusLabel: string;
};

export type FundWaterfallTier = {
  key: 'returnOfCapital' | 'preferredReturn' | 'gpCatchUp' | 'carriedInterest';
  label: string;
  lpAmountKrw: number;
  gpAmountKrw: number;
  totalKrw: number;
  sharePct: number;
};

export type FundWaterfallTotals = {
  committedKrw: number;
  calledKrw: number;
  distributedKrw: number;
  remainingCommitmentKrw: number;
  navKrw: number;
  dpiMultiple: number;
  tvpiMultiple: number;
  capitalCallCount: number;
  distributionCount: number;
  vehicleCount: number;
  investorCount: number;
};

export type FundWaterfallData = {
  fund: {
    id: string;
    code: string;
    name: string;
    strategy: string | null;
    vintageYear: number | null;
    baseCurrency: string;
  };
  totals: FundWaterfallTotals;
  investors: FundWaterfallInvestorRow[];
  tiers: FundWaterfallTier[];
  hurdleRatePct: number;
  carriedInterestPct: number;
  generatedAt: string;
};

const HURDLE_RATE_PCT = 8;
const CARRIED_INTEREST_PCT = 20;
const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (value == null) return 0;
  const maybe = value as { toNumber?: () => number };
  if (typeof maybe.toNumber === 'function') return maybe.toNumber();
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export type FundWaterfallTierResult = {
  returnOfCapitalAmount: number;
  preferredReturnAmount: number;
  accruedPreferredReturn: number;
  gpCatchUpAmount: number;
  carryLpAmount: number;
  carryGpAmount: number;
  /** True when the elapsed-time accrual of the preferred return is time-weighted. */
  prefIsTimeWeighted: boolean;
};

type DatedCashflow = { date: Date; amountKrw: number };

/**
 * Accrue the LP preferred return on *unreturned* called capital, compounding at
 * `hurdleRatePct` per annum, mirroring the European-style convention in
 * `valuation/lp-gp-waterfall.ts`.
 *
 * Unlike the pro-forma calculator (which works on equal annual periods), here we
 * only have aggregate called/distributed figures plus dated capital-call and
 * distribution events. We therefore walk the merged event timeline, accruing
 * compounding pref on the running unreturned-capital balance between consecutive
 * dates. Capital calls raise the balance; distributions first return capital
 * (Tier 1) and the remainder pays down accrued pref (Tier 2).
 *
 * When no dated events are available we cannot establish a time dimension, so we
 * fall back to a single-period accrual of `calledKrw * rate` (one year). This is
 * still bounded by actual distributions downstream and is documented as a
 * limitation in the returned `prefIsTimeWeighted` flag.
 */
function accruePreferredReturn(
  calledKrw: number,
  capitalCalls: DatedCashflow[],
  distributions: DatedCashflow[],
  hurdleRatePct: number,
  asOf: Date
): { accrued: number; timeWeighted: boolean } {
  const rate = hurdleRatePct / 100;

  const datedCalls = capitalCalls.filter((c) => c.amountKrw > 0 && !Number.isNaN(c.date.getTime()));
  const datedDistros = distributions.filter(
    (d) => d.amountKrw > 0 && !Number.isNaN(d.date.getTime())
  );

  // Without dated events we have no time dimension. Fall back to a one-year
  // accrual on called capital so the figure is non-zero and conservative.
  if (datedCalls.length === 0) {
    return { accrued: calledKrw * rate, timeWeighted: false };
  }

  type Event = { date: Date; calls: number; distros: number };
  const byDate = new Map<number, Event>();
  const push = (date: Date, calls: number, distros: number) => {
    const key = date.getTime();
    const existing = byDate.get(key);
    if (existing) {
      existing.calls += calls;
      existing.distros += distros;
    } else {
      byDate.set(key, { date, calls, distros });
    }
  };
  for (const c of datedCalls) push(c.date, c.amountKrw, 0);
  for (const d of datedDistros) push(d.date, 0, d.amountKrw);

  const events = Array.from(byDate.values()).sort((a, b) => a.date.getTime() - b.date.getTime());

  let unreturnedCapital = 0;
  let accruedPref = 0;
  let prevDate = events[0]!.date;

  const accrueTo = (date: Date) => {
    const years = (date.getTime() - prevDate.getTime()) / MS_PER_YEAR;
    if (years > 0 && unreturnedCapital + accruedPref > 0) {
      // Compound annually on (unreturned capital + previously accrued pref).
      const growth = (unreturnedCapital + accruedPref) * (Math.pow(1 + rate, years) - 1);
      accruedPref += growth;
    }
    prevDate = date;
  };

  for (const event of events) {
    accrueTo(event.date);
    // Capital calls raise unreturned capital.
    unreturnedCapital += event.calls;
    // Distributions return capital first (Tier 1), then pay accrued pref (Tier 2).
    let remaining = event.distros;
    const roc = Math.min(remaining, unreturnedCapital);
    unreturnedCapital -= roc;
    remaining -= roc;
    const prefPaid = Math.min(remaining, accruedPref);
    accruedPref -= prefPaid;
  }

  // Accrue from the final event up to the valuation date.
  if (!Number.isNaN(asOf.getTime())) {
    accrueTo(asOf);
  }

  return { accrued: Math.max(0, Math.round(accruedPref)), timeWeighted: true };
}

/**
 * Pure, DB-free waterfall tier calculation. Splits cumulative distributions into
 * the four European-style tiers using the corrected conventions:
 *
 *   1. Return of capital — LP, up to called capital.
 *   2. Preferred return  — LP, up to the time-weighted compounding accrual.
 *   3. GP catch-up       — GP, until GP's share of *profit above return of
 *                          capital* equals the carry percentage.
 *   4. Carried interest  — remainder split LP/GP per the carry percentage.
 */
export function computeFundWaterfallTiers(params: {
  calledKrw: number;
  distributedKrw: number;
  capitalCalls: DatedCashflow[];
  distributions: DatedCashflow[];
  hurdleRatePct?: number;
  carriedInterestPct?: number;
  asOf?: Date;
}): FundWaterfallTierResult {
  const hurdleRatePct = params.hurdleRatePct ?? HURDLE_RATE_PCT;
  const carriedInterestPct = params.carriedInterestPct ?? CARRIED_INTEREST_PCT;
  const { calledKrw, distributedKrw } = params;
  const asOf = params.asOf ?? new Date();

  const { accrued: accruedPreferredReturn, timeWeighted } = accruePreferredReturn(
    calledKrw,
    params.capitalCalls,
    params.distributions,
    hurdleRatePct,
    asOf
  );

  // Tier 1 — return of capital.
  const returnOfCapitalAmount = Math.min(distributedKrw, calledKrw);
  const remainingAfterRoc = Math.max(distributedKrw - returnOfCapitalAmount, 0);

  // Tier 2 — preferred return, capped at the accrued amount.
  const preferredReturnAmount = Math.min(accruedPreferredReturn, remainingAfterRoc);
  const remainingAfterPref = Math.max(remainingAfterRoc - preferredReturnAmount, 0);

  // Tier 3 — GP catch-up. Bring GP up to its carry share of *total profit above
  // return of capital* (pref + catch-up + future carry), not of the pref slice.
  // At the end of catch-up: gpCatchUp / (preferredReturnAmount + gpCatchUp) = carry%.
  // => gpCatchUp = preferredReturnAmount * carry / (100 - carry).
  // Distributions beyond that point are split per the carry percentage so the GP
  // share converges to carry% of all profit.
  const carryFraction = carriedInterestPct / 100;
  const catchUpTarget =
    carryFraction < 1
      ? (preferredReturnAmount * carriedInterestPct) / (100 - carriedInterestPct)
      : Number.POSITIVE_INFINITY;
  const gpCatchUpAmount = Math.min(catchUpTarget, remainingAfterPref);
  const remainingAfterCatchUp = Math.max(remainingAfterPref - gpCatchUpAmount, 0);

  // Tier 4 — carried interest split on the residual.
  const carryLpAmount = (remainingAfterCatchUp * (100 - carriedInterestPct)) / 100;
  const carryGpAmount = (remainingAfterCatchUp * carriedInterestPct) / 100;

  return {
    returnOfCapitalAmount,
    preferredReturnAmount,
    accruedPreferredReturn,
    gpCatchUpAmount,
    carryLpAmount,
    carryGpAmount,
    prefIsTimeWeighted: timeWeighted
  };
}

export async function buildFundWaterfall(
  fundId: string,
  db: PrismaClient = prisma
): Promise<FundWaterfallData> {
  const fund = await db.fund.findUnique({
    where: { id: fundId },
    include: {
      vehicles: true,
      commitments: {
        include: {
          investor: true
        }
      },
      capitalCalls: true,
      distributions: true
    }
  });

  if (!fund) throw new Error('Fund not found.');

  const committedKrw = fund.commitments.reduce((sum, c) => sum + toNumber(c.commitmentKrw), 0);
  const calledKrw = fund.commitments.reduce((sum, c) => sum + toNumber(c.calledKrw), 0);
  const distributedKrw = fund.commitments.reduce((sum, c) => sum + toNumber(c.distributedKrw), 0);
  const remainingCommitmentKrw = Math.max(committedKrw - calledKrw, 0);
  const navKrw = Math.max(calledKrw - distributedKrw, 0);

  const dpiMultiple = calledKrw > 0 ? Number((distributedKrw / calledKrw).toFixed(2)) : 0;
  const tvpiMultiple =
    calledKrw > 0 ? Number(((distributedKrw + navKrw) / calledKrw).toFixed(2)) : 0;

  const investors: FundWaterfallInvestorRow[] = fund.commitments
    .map((commitment) => {
      const committed = toNumber(commitment.commitmentKrw);
      const called = toNumber(commitment.calledKrw);
      const distributed = toNumber(commitment.distributedKrw);
      return {
        investorId: commitment.investorId,
        investorCode: commitment.investor?.code ?? commitment.investorId,
        investorName: commitment.investor?.name ?? 'Unknown investor',
        investorType: commitment.investor?.investorType ?? null,
        committedKrw: committed,
        calledKrw: called,
        distributedKrw: distributed,
        remainingCommitmentKrw: Math.max(committed - called, 0),
        sharePct: committedKrw > 0 ? (committed / committedKrw) * 100 : 0,
        statusLabel: commitment.statusLabel
      };
    })
    .sort((a, b) => b.committedKrw - a.committedKrw);

  const {
    returnOfCapitalAmount,
    preferredReturnAmount,
    gpCatchUpAmount,
    carryLpAmount,
    carryGpAmount
  } = computeFundWaterfallTiers({
    calledKrw,
    distributedKrw,
    capitalCalls: fund.capitalCalls.map((c) => ({
      date: c.callDate,
      amountKrw: toNumber(c.amountKrw)
    })),
    distributions: fund.distributions.map((d) => ({
      date: d.distributionDate,
      amountKrw: toNumber(d.amountKrw)
    })),
    hurdleRatePct: HURDLE_RATE_PCT,
    carriedInterestPct: CARRIED_INTEREST_PCT
  });

  const remainingAfterCatchUp = carryLpAmount + carryGpAmount;

  const tierTotal = (amt: number) => (distributedKrw > 0 ? (amt / distributedKrw) * 100 : 0);

  const tiers: FundWaterfallTier[] = [
    {
      key: 'returnOfCapital',
      label: 'Return of Capital',
      lpAmountKrw: returnOfCapitalAmount,
      gpAmountKrw: 0,
      totalKrw: returnOfCapitalAmount,
      sharePct: tierTotal(returnOfCapitalAmount)
    },
    {
      key: 'preferredReturn',
      label: `Preferred Return (${HURDLE_RATE_PCT}%)`,
      lpAmountKrw: preferredReturnAmount,
      gpAmountKrw: 0,
      totalKrw: preferredReturnAmount,
      sharePct: tierTotal(preferredReturnAmount)
    },
    {
      key: 'gpCatchUp',
      label: 'GP Catch-up',
      lpAmountKrw: 0,
      gpAmountKrw: gpCatchUpAmount,
      totalKrw: gpCatchUpAmount,
      sharePct: tierTotal(gpCatchUpAmount)
    },
    {
      key: 'carriedInterest',
      label: `Carry Split (${100 - CARRIED_INTEREST_PCT}/${CARRIED_INTEREST_PCT})`,
      lpAmountKrw: carryLpAmount,
      gpAmountKrw: carryGpAmount,
      totalKrw: remainingAfterCatchUp,
      sharePct: tierTotal(remainingAfterCatchUp)
    }
  ];

  return {
    fund: {
      id: fund.id,
      code: fund.code,
      name: fund.name,
      strategy: fund.strategy ?? null,
      vintageYear: fund.vintageYear ?? null,
      baseCurrency: fund.baseCurrency
    },
    totals: {
      committedKrw,
      calledKrw,
      distributedKrw,
      remainingCommitmentKrw,
      navKrw,
      dpiMultiple,
      tvpiMultiple,
      capitalCallCount: fund.capitalCalls.length,
      distributionCount: fund.distributions.length,
      vehicleCount: fund.vehicles.length,
      investorCount: investors.length
    },
    investors,
    tiers,
    hurdleRatePct: HURDLE_RATE_PCT,
    carriedInterestPct: CARRIED_INTEREST_PCT,
    generatedAt: new Date().toISOString()
  };
}
