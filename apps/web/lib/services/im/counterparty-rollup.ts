/**
 * Counterparty-portfolio rollup. When the asset has multiple
 * counterparties (sponsor + several anchor tenants), the IM
 * benefits from a single summary line that aggregates the credit
 * picture: weighted average score, weighted leverage, fraction in
 * each risk band.
 *
 * Weights are by EBITDA when statements carry EBITDA; otherwise
 * by Revenue; otherwise equal-weighted as a fallback.
 */

type Decimalish =
  | number
  | { toNumber: () => number }
  | null
  | undefined;

function toNum(v: Decimalish): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof (v as { toNumber?: () => number }).toNumber === 'function') {
    const n = (v as { toNumber: () => number }).toNumber();
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

type CounterpartyLike = {
  id: string;
  name: string;
  role: string;
  financialStatements?: Array<{
    ebitdaKrw?: Decimalish;
    revenueKrw?: Decimalish;
    totalDebtKrw?: Decimalish;
    interestExpenseKrw?: Decimalish;
    creditAssessments?: Array<{
      score: number;
      riskLevel: string;
    }>;
  }>;
};

export type CounterpartyRollup = {
  counterpartyCount: number;
  weightingBasis: 'ebitda' | 'revenue' | 'equal';
  averageScore: number | null;
  weightedLeverage: number | null;
  weightedInterestCoverage: number | null;
  totalRevenueKrw: number;
  totalEbitdaKrw: number;
  totalDebtKrw: number;
  riskMix: { LOW: number; MODERATE: number; HIGH: number; OTHER: number };
  weakestCounterpartyName: string | null;
};

export function buildCounterpartyRollup(
  counterparties: CounterpartyLike[]
): CounterpartyRollup | null {
  if (counterparties.length === 0) return null;

  let totalRevenueKrw = 0;
  let totalEbitdaKrw = 0;
  let totalDebtKrw = 0;
  let totalInterestKrw = 0;
  const riskMix = { LOW: 0, MODERATE: 0, HIGH: 0, OTHER: 0 };
  const scoreEntries: Array<{ weight: number; score: number; name: string }> = [];

  for (const cp of counterparties) {
    const fs = cp.financialStatements?.[0];
    if (!fs) continue;
    const rev = toNum(fs.revenueKrw) ?? 0;
    const ebitda = toNum(fs.ebitdaKrw) ?? 0;
    const debt = toNum(fs.totalDebtKrw) ?? 0;
    const interest = toNum(fs.interestExpenseKrw) ?? 0;
    totalRevenueKrw += rev;
    totalEbitdaKrw += ebitda;
    totalDebtKrw += debt;
    totalInterestKrw += interest;

    const ca = fs.creditAssessments?.[0];
    if (ca) {
      const band = ca.riskLevel as keyof typeof riskMix;
      if (band === 'LOW' || band === 'MODERATE' || band === 'HIGH') {
        riskMix[band] += 1;
      } else {
        riskMix.OTHER += 1;
      }
      const weight = ebitda > 0 ? ebitda : rev > 0 ? rev : 1;
      scoreEntries.push({ weight, score: ca.score, name: cp.name });
    }
  }

  const weightingBasis: 'ebitda' | 'revenue' | 'equal' =
    totalEbitdaKrw > 0 ? 'ebitda' : totalRevenueKrw > 0 ? 'revenue' : 'equal';

  const totalWeight = scoreEntries.reduce((s, r) => s + r.weight, 0);
  const averageScore =
    scoreEntries.length === 0
      ? null
      : totalWeight > 0
        ? scoreEntries.reduce((s, r) => s + r.score * r.weight, 0) / totalWeight
        : scoreEntries.reduce((s, r) => s + r.score, 0) / scoreEntries.length;

  const weightedLeverage =
    totalEbitdaKrw > 0 ? totalDebtKrw / totalEbitdaKrw : null;
  const weightedInterestCoverage =
    totalInterestKrw > 0 ? totalEbitdaKrw / totalInterestKrw : null;

  const weakestCounterpartyName = scoreEntries
    .slice()
    .sort((a, b) => a.score - b.score)[0]?.name ?? null;

  return {
    counterpartyCount: counterparties.length,
    weightingBasis,
    averageScore,
    weightedLeverage,
    weightedInterestCoverage,
    totalRevenueKrw,
    totalEbitdaKrw,
    totalDebtKrw,
    riskMix,
    weakestCounterpartyName
  };
}
