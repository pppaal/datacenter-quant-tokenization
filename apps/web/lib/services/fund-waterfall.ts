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

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (value == null) return 0;
  const maybe = value as { toNumber?: () => number };
  if (typeof maybe.toNumber === 'function') return maybe.toNumber();
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
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

  const hurdlePreferredReturn = (calledKrw * HURDLE_RATE_PCT) / 100;
  const returnOfCapitalAmount = Math.min(distributedKrw, calledKrw);
  const remainingAfterRoc = Math.max(distributedKrw - returnOfCapitalAmount, 0);
  const preferredReturnAmount = Math.min(hurdlePreferredReturn, remainingAfterRoc);
  const remainingAfterPref = Math.max(remainingAfterRoc - preferredReturnAmount, 0);

  const catchUpTarget =
    (preferredReturnAmount * CARRIED_INTEREST_PCT) / (100 - CARRIED_INTEREST_PCT);
  const gpCatchUpAmount = Math.min(catchUpTarget, remainingAfterPref);
  const remainingAfterCatchUp = Math.max(remainingAfterPref - gpCatchUpAmount, 0);

  const carryLpAmount = (remainingAfterCatchUp * (100 - CARRIED_INTEREST_PCT)) / 100;
  const carryGpAmount = (remainingAfterCatchUp * CARRIED_INTEREST_PCT) / 100;

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
