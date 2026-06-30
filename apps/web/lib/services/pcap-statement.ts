/**
 * ILPA-style Partners' Capital Account Statement (PCAP roll-forward) — benchmark #11.
 *
 * The existing `pcapToXlsxSpec` ships a flat capital-account SUMMARY (committed /
 * called / distributed / NAV / IRR per LP). Institutional LPs additionally expect
 * the ILPA reporting-template ROLL-FORWARD:
 *
 *     beginning balance
 *       + contributions
 *       − distributions
 *       + net operating result   (realized + unrealized P&L, net of fees/carry)
 *       = ending balance
 *
 * This builder derives that statement from the `PcapResult` that already powers the
 * on-screen capital account, so it stays in lock-step with `buildFundPcap`. PURE and
 * DB-free → fully unit-testable.
 *
 * Two bases:
 *  - INCEPTION_TO_DATE (default): beginning = 0, contributions = called-to-date,
 *    distributions = distributed-to-date, ending = current NAV share. Fully derivable
 *    from data we have — no historical NAV snapshots needed.
 *  - PERIOD: supply a window + dated cashflows + the prior period-end NAV share per LP
 *    (`priorNavShareByInvestor`) and the period columns are computed; contributions /
 *    distributions are filtered to the window (per-LP when the cashflows carry an
 *    `investorId`, else allocated pro-rata by commitment).
 *
 * `netOperatingResult` is a BALANCING figure (ending − beginning − contributions +
 * distributions). It is not separately attributed to management fees / carried
 * interest / realized vs unrealized — that requires GL-level data this model does not
 * carry. Documented here so the figure is not mistaken for a fee-itemized line.
 */
import { Prisma } from '@prisma/client';
import type { PcapResult, PcapFundCashflow } from '@/lib/services/fund-nav';

function toDecimal(value: unknown, fallback = 0): Prisma.Decimal {
  if (value instanceof Prisma.Decimal) return value;
  if (value == null) return new Prisma.Decimal(fallback);
  if (typeof value === 'number')
    return new Prisma.Decimal(Number.isFinite(value) ? value : fallback);
  if (typeof value === 'object' && 'toNumber' in value && typeof value.toNumber === 'function') {
    return new Prisma.Decimal((value as { toNumber(): number }).toNumber());
  }
  const n = Number(value);
  return new Prisma.Decimal(Number.isFinite(n) ? n : fallback);
}

export type PcapStatementBasis = 'INCEPTION_TO_DATE' | 'PERIOD';

export type PcapStatementLine = {
  investorId: string;
  investorCode: string | null;
  investorName: string | null;
  investorType: string | null;
  beginningBalanceKrw: number;
  contributionsKrw: number;
  /** Positive magnitude of distributions in the period (shown as a reduction). */
  distributionsKrw: number;
  /** Balancing P&L: ending − beginning − contributions + distributions. May be negative. */
  netOperatingResultKrw: number;
  endingBalanceKrw: number;
};

export type PcapStatement = {
  basis: PcapStatementBasis;
  periodLabel: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  asOf: string;
  /** True when fund-level cashflows were split pro-rata (no per-LP allocation rows). */
  cashflowsAllocatedProRata: boolean;
  lines: PcapStatementLine[];
  /** Fund-level roll-forward (investorId === '__TOTAL__'). */
  totals: PcapStatementLine;
};

export const PCAP_TOTAL_ID = '__TOTAL__';

function inWindow(date: Date, start: Date, end: Date): boolean {
  const t = date.getTime();
  return !Number.isNaN(t) && t >= start.getTime() && t <= end.getTime();
}

/**
 * Sum a dated cashflow set into the window, either per-LP (when the rows carry an
 * `investorId`) or fund-level × this LP's commitment share.
 */
function sumWindowed(
  flows: PcapFundCashflow[],
  investorId: string,
  shareFractionDec: Prisma.Decimal,
  start: Date,
  end: Date,
  perInvestor: boolean
): Prisma.Decimal {
  let acc = new Prisma.Decimal(0);
  for (const f of flows) {
    if (!inWindow(new Date(f.date), start, end)) continue;
    const amount = toDecimal(f.amountKrw).abs();
    if (perInvestor) {
      if (f.investorId === investorId) acc = acc.plus(amount);
    } else {
      acc = acc.plus(amount.mul(shareFractionDec));
    }
  }
  return acc;
}

export function buildPcapStatement(params: {
  pcap: PcapResult;
  asOf?: Date;
  period?: {
    label: string;
    start: Date;
    end: Date;
    fundCapitalCalls?: PcapFundCashflow[];
    fundDistributions?: PcapFundCashflow[];
    /** Beginning-of-period NAV share per investorId (prior period-end balance). */
    priorNavShareByInvestor?: Record<string, number>;
  };
}): PcapStatement {
  const { pcap, period } = params;
  const asOf = params.asOf ?? new Date();
  const totalCommittedDec = toDecimal(pcap.totals.committedKrw);

  const lines: PcapStatementLine[] = pcap.investors.map((lp) => {
    const beginningDec =
      period?.priorNavShareByInvestor != null
        ? toDecimal(period.priorNavShareByInvestor[lp.investorId] ?? 0)
        : new Prisma.Decimal(0);
    const endingDec = toDecimal(lp.navShareKrw);

    let contributionsDec: Prisma.Decimal;
    let distributionsDec: Prisma.Decimal;

    if (period) {
      const calls = period.fundCapitalCalls ?? [];
      const distros = period.fundDistributions ?? [];
      const callsPerInvestor = calls.some((c) => c.investorId != null);
      const distrosPerInvestor = distros.some((d) => d.investorId != null);
      const shareFractionDec = totalCommittedDec.greaterThan(0)
        ? toDecimal(lp.committedKrw).div(totalCommittedDec)
        : new Prisma.Decimal(0);
      contributionsDec = sumWindowed(
        calls,
        lp.investorId,
        shareFractionDec,
        period.start,
        period.end,
        callsPerInvestor
      );
      distributionsDec = sumWindowed(
        distros,
        lp.investorId,
        shareFractionDec,
        period.start,
        period.end,
        distrosPerInvestor
      );
    } else {
      // Inception-to-date: cumulative figures straight off the capital account.
      contributionsDec = toDecimal(lp.calledKrw);
      distributionsDec = toDecimal(lp.distributedKrw);
    }

    // Roll-forward identity → net operating result is the balancing figure.
    const netOperatingResultDec = endingDec
      .minus(beginningDec)
      .minus(contributionsDec)
      .plus(distributionsDec);

    return {
      investorId: lp.investorId,
      investorCode: lp.investorCode,
      investorName: lp.investorName,
      investorType: lp.investorType,
      beginningBalanceKrw: beginningDec.toNumber(),
      contributionsKrw: contributionsDec.toNumber(),
      distributionsKrw: distributionsDec.toNumber(),
      netOperatingResultKrw: netOperatingResultDec.toNumber(),
      endingBalanceKrw: endingDec.toNumber()
    };
  });

  const sumDec = (pick: (l: PcapStatementLine) => number) =>
    lines.reduce((s, l) => s.plus(toDecimal(pick(l))), new Prisma.Decimal(0));
  const beginTotal = sumDec((l) => l.beginningBalanceKrw);
  const contribTotal = sumDec((l) => l.contributionsKrw);
  const distroTotal = sumDec((l) => l.distributionsKrw);
  const endTotal = sumDec((l) => l.endingBalanceKrw);
  const norTotal = endTotal.minus(beginTotal).minus(contribTotal).plus(distroTotal);

  // Pro-rata only meaningful in PERIOD mode (ITD uses exact per-LP cumulative figures).
  const cashflowsAllocatedProRata = period
    ? !(
        (period.fundCapitalCalls ?? []).some((c) => c.investorId != null) ||
        (period.fundDistributions ?? []).some((d) => d.investorId != null)
      )
    : false;

  return {
    basis: period ? 'PERIOD' : 'INCEPTION_TO_DATE',
    periodLabel: period?.label ?? null,
    periodStart: period ? period.start.toISOString() : null,
    periodEnd: period ? period.end.toISOString() : null,
    asOf: asOf.toISOString(),
    cashflowsAllocatedProRata,
    lines,
    totals: {
      investorId: PCAP_TOTAL_ID,
      investorCode: null,
      investorName: null,
      investorType: null,
      beginningBalanceKrw: beginTotal.toNumber(),
      contributionsKrw: contribTotal.toNumber(),
      distributionsKrw: distroTotal.toNumber(),
      netOperatingResultKrw: norTotal.toNumber(),
      endingBalanceKrw: endTotal.toNumber()
    }
  };
}
