import type { BundleLease, BundleLeaseStep } from '@/lib/services/valuation/types';

export type LeaseExpiryLadderRow = {
  expiryYear: number;
  expiringKw: number;
  leaseCount: number;
  weightedRenewProbabilityPct: number | null;
  weightedRolloverDowntimeMonths: number | null;
  weightedRenewalTermYears: number | null;
  weightedRenewalCount: number | null;
  weightedMarkToMarketRatePerKwKrw: number | null;
  firstRenewalStartYear: number | null;
  lastModeledRenewalEndYear: number | null;
};

export type LeaseExpiryDetail = {
  leaseId: string;
  tenantName: string;
  expiryYear: number;
  expiringKw: number;
  renewProbabilityPct: number | null;
  rolloverDowntimeMonths: number | null;
  renewalTermYears: number | null;
  renewalCount: number | null;
  markToMarketRatePerKwKrw: number | null;
  firstRenewalStartYear: number | null;
  lastModeledRenewalEndYear: number | null;
};

export type LeaseExpiryLadderSummary = {
  totalContractedKw: number;
  nearTermExpiryKw: number;
  weightedRenewProbabilityPct: number | null;
  latestExpiryYear: number | null;
  rows: LeaseExpiryLadderRow[];
  details: LeaseExpiryDetail[];
};

function resolveLastEffectiveStep(steps: BundleLeaseStep[]) {
  if (steps.length === 0) return undefined;
  return [...steps].sort((left, right) => {
    if (left.endYear !== right.endYear) return right.endYear - left.endYear;
    return right.stepOrder - left.stepOrder;
  })[0];
}

function weightedAverage(weighted: number, weight: number) {
  return weight > 0 ? weighted / weight : null;
}

export function buildLeaseExpiryLadder(
  leases: BundleLease[],
  options?: {
    nearTermYears?: number;
  }
): LeaseExpiryLadderSummary {
  const nearTermYears = options?.nearTermYears ?? 3;
  const details = leases
    .map<LeaseExpiryDetail>((lease) => {
      const lastStep = resolveLastEffectiveStep(lease.steps);
      const expiringKw = lastStep?.leasedKw ?? lease.leasedKw ?? 0;
      const expiryYear = (lease.startYear ?? 1) + (lease.termYears ?? 1) - 1;
      const renewProbabilityPct = lastStep?.renewProbabilityPct ?? lease.renewProbabilityPct ?? null;
      const rolloverDowntimeMonths =
        lastStep?.rolloverDowntimeMonths ?? lease.rolloverDowntimeMonths ?? null;
      const renewalTermYears =
        lastStep?.renewalTermYears ?? lease.renewalTermYears ?? lease.termYears ?? null;
      const renewalCount = lastStep?.renewalCount ?? lease.renewalCount ?? 1;
      const markToMarketRatePerKwKrw =
        lastStep?.markToMarketRatePerKwKrw ?? lease.markToMarketRatePerKwKrw ?? null;
      const firstRenewalStartYear =
        renewProbabilityPct && renewProbabilityPct > 0 ? expiryYear + 1 : null;
      const lastModeledRenewalEndYear =
        firstRenewalStartYear !== null && renewalTermYears !== null && renewalCount !== null
          ? firstRenewalStartYear + renewalTermYears * renewalCount - 1
          : null;

      return {
        leaseId: lease.id,
        tenantName: lease.tenantName,
        expiryYear,
        expiringKw,
        renewProbabilityPct,
        rolloverDowntimeMonths,
        renewalTermYears,
        renewalCount,
        markToMarketRatePerKwKrw,
        firstRenewalStartYear,
        lastModeledRenewalEndYear
      };
    })
    .sort((left, right) => left.expiryYear - right.expiryYear || right.expiringKw - left.expiringKw);

  const rowMap = new Map<number, LeaseExpiryLadderRow & {
    renewProbabilityWeighted: number;
    rolloverWeighted: number;
    renewalTermWeighted: number;
    renewalCountWeighted: number;
    mtmRateWeighted: number;
  }>();

  for (const detail of details) {
    const current =
      rowMap.get(detail.expiryYear) ??
      {
        expiryYear: detail.expiryYear,
        expiringKw: 0,
        leaseCount: 0,
        weightedRenewProbabilityPct: null,
        weightedRolloverDowntimeMonths: null,
        weightedRenewalTermYears: null,
        weightedRenewalCount: null,
        weightedMarkToMarketRatePerKwKrw: null,
        firstRenewalStartYear: null,
        lastModeledRenewalEndYear: null,
        renewProbabilityWeighted: 0,
        rolloverWeighted: 0,
        renewalTermWeighted: 0,
        renewalCountWeighted: 0,
        mtmRateWeighted: 0
      };

    current.expiringKw += detail.expiringKw;
    current.leaseCount += 1;
    current.firstRenewalStartYear =
      current.firstRenewalStartYear === null
        ? detail.firstRenewalStartYear
        : Math.min(current.firstRenewalStartYear, detail.firstRenewalStartYear ?? current.firstRenewalStartYear);
    current.lastModeledRenewalEndYear =
      current.lastModeledRenewalEndYear === null
        ? detail.lastModeledRenewalEndYear
        : Math.max(
            current.lastModeledRenewalEndYear,
            detail.lastModeledRenewalEndYear ?? current.lastModeledRenewalEndYear
          );

    if (detail.renewProbabilityPct !== null) {
      current.renewProbabilityWeighted += detail.renewProbabilityPct * detail.expiringKw;
    }
    if (detail.rolloverDowntimeMonths !== null) {
      current.rolloverWeighted += detail.rolloverDowntimeMonths * detail.expiringKw;
    }
    if (detail.renewalTermYears !== null) {
      current.renewalTermWeighted += detail.renewalTermYears * detail.expiringKw;
    }
    if (detail.renewalCount !== null) {
      current.renewalCountWeighted += detail.renewalCount * detail.expiringKw;
    }
    if (detail.markToMarketRatePerKwKrw !== null) {
      current.mtmRateWeighted += detail.markToMarketRatePerKwKrw * detail.expiringKw;
    }

    rowMap.set(detail.expiryYear, current);
  }

  const rows = [...rowMap.values()]
    .sort((left, right) => left.expiryYear - right.expiryYear)
    .map((row) => ({
      expiryYear: row.expiryYear,
      expiringKw: row.expiringKw,
      leaseCount: row.leaseCount,
      weightedRenewProbabilityPct: weightedAverage(row.renewProbabilityWeighted, row.expiringKw),
      weightedRolloverDowntimeMonths: weightedAverage(row.rolloverWeighted, row.expiringKw),
      weightedRenewalTermYears: weightedAverage(row.renewalTermWeighted, row.expiringKw),
      weightedRenewalCount: weightedAverage(row.renewalCountWeighted, row.expiringKw),
      weightedMarkToMarketRatePerKwKrw: weightedAverage(row.mtmRateWeighted, row.expiringKw),
      firstRenewalStartYear: row.firstRenewalStartYear,
      lastModeledRenewalEndYear: row.lastModeledRenewalEndYear
    }));

  const totalContractedKw = details.reduce((sum, detail) => sum + detail.expiringKw, 0);
  const earliestExpiryYear = rows[0]?.expiryYear ?? null;
  const nearTermExpiryKw =
    earliestExpiryYear === null
      ? 0
      : rows
          .filter((row) => row.expiryYear <= earliestExpiryYear + nearTermYears - 1)
          .reduce((sum, row) => sum + row.expiringKw, 0);
  const weightedRenewProbabilityPct =
    totalContractedKw > 0
      ? details.reduce(
          (sum, detail) => sum + (detail.renewProbabilityPct ?? 0) * detail.expiringKw,
          0
        ) / totalContractedKw
      : null;

  return {
    totalContractedKw,
    nearTermExpiryKw,
    weightedRenewProbabilityPct,
    latestExpiryYear: rows.at(-1)?.expiryYear ?? null,
    rows,
    details
  };
}
