/**
 * Capital call schedule derived from the year-by-year proforma.
 * Real fund vehicles model an explicit call schedule per LP per
 * tranche; the IM uses the proforma's reserve contributions and
 * year-1 equity outflow as a proxy when no formal schedule is on
 * file. Each row carries: call number, period, amountKrw,
 * cumulativeKrw, % of commitment, purpose label.
 */

type ProFormaYearLike = {
  year: number;
  reserveContributionKrw: number;
  afterTaxDistributionKrw: number;
};

export type CapitalCallRow = {
  callNumber: number;
  yearLabel: string;
  amountKrw: number;
  cumulativeKrw: number;
  cumulativePctOfCommitment: number;
  purpose: string;
};

export type CapitalCallSchedule = {
  rows: CapitalCallRow[];
  totalCommitmentKrw: number;
  upfrontPctOfCommitment: number;
  remainingUncalledKrw: number;
  estimatedFinalCallYear: string | null;
};

export function buildCapitalCallSchedule(
  proFormaYears: ProFormaYearLike[],
  options: {
    initialEquityCommitmentKrw: number;
    baseYear: number;
  }
): CapitalCallSchedule | null {
  if (proFormaYears.length === 0 || options.initialEquityCommitmentKrw <= 0) {
    return null;
  }
  const rows: CapitalCallRow[] = [];
  let cumulative = 0;
  let callNumber = 1;
  // Initial close call covers initial equity outflow at close.
  cumulative += options.initialEquityCommitmentKrw * 0.6;
  rows.push({
    callNumber: callNumber++,
    yearLabel: `${options.baseYear} · close`,
    amountKrw: options.initialEquityCommitmentKrw * 0.6,
    cumulativeKrw: cumulative,
    cumulativePctOfCommitment: (cumulative / options.initialEquityCommitmentKrw) * 100,
    purpose: 'Initial close — purchase + working capital'
  });
  // Year 1 follow-on for capex draw catch-up.
  cumulative += options.initialEquityCommitmentKrw * 0.3;
  rows.push({
    callNumber: callNumber++,
    yearLabel: `${options.baseYear + 1} · build-out`,
    amountKrw: options.initialEquityCommitmentKrw * 0.3,
    cumulativeKrw: cumulative,
    cumulativePctOfCommitment: (cumulative / options.initialEquityCommitmentKrw) * 100,
    purpose: 'Construction draw + IT fit-out'
  });
  // Reserve top-up call when reserve contributions are positive in the
  // first 3 years.
  const reserveTopUp = proFormaYears
    .slice(0, 3)
    .reduce((s, y) => s + y.reserveContributionKrw, 0);
  if (reserveTopUp > 0) {
    cumulative += reserveTopUp;
    rows.push({
      callNumber: callNumber++,
      yearLabel: `${options.baseYear + 2} · reserve top-up`,
      amountKrw: reserveTopUp,
      cumulativeKrw: cumulative,
      cumulativePctOfCommitment:
        (cumulative / options.initialEquityCommitmentKrw) * 100,
      purpose: 'Debt-service reserve build per facility covenant'
    });
  }

  const remaining = Math.max(0, options.initialEquityCommitmentKrw - cumulative);
  const upfrontPct = rows[0]?.cumulativePctOfCommitment ?? 0;
  return {
    rows,
    totalCommitmentKrw: options.initialEquityCommitmentKrw,
    upfrontPctOfCommitment: upfrontPct,
    remainingUncalledKrw: remaining,
    estimatedFinalCallYear: rows[rows.length - 1]?.yearLabel ?? null
  };
}
