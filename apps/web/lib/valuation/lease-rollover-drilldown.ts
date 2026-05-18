import type { BundleLease, BundleLeaseStep } from '@/lib/services/valuation/types';

export type LeaseRolloverMonthRow = {
  monthIndex: number;
  year: number;
  month: number;
  periodLabel: string;
  downtimeKw: number;
  rentFreeKw: number;
  returningKw: number;
  tenantCapitalCostKrw: number;
  weightedMarkToMarketRatePerKwKrw: number | null;
  affectedLeaseCount: number;
  leases: string[];
  leaseRefs: Array<{
    id: string;
    tenantName: string;
  }>;
};

export type LeaseRolloverDrilldown = {
  firstModeledMonthIndex: number | null;
  windowMonths: number;
  peakDowntimeKw: number;
  peakRentFreeKw: number;
  totalRenewalCapitalKrw: number;
  rows: LeaseRolloverMonthRow[];
};

function resolveLastEffectiveStep(steps: BundleLeaseStep[]) {
  if (steps.length === 0) return undefined;
  return [...steps].sort((left, right) => {
    if (left.endYear !== right.endYear) return right.endYear - left.endYear;
    return right.stepOrder - left.stepOrder;
  })[0];
}

function toMonthIndex(year: number, month: number) {
  return (year - 1) * 12 + month;
}

function fromMonthIndex(monthIndex: number) {
  const year = Math.floor((monthIndex - 1) / 12) + 1;
  const month = ((monthIndex - 1) % 12) + 1;
  return { year, month, periodLabel: `Y${year} M${month}` };
}

export function buildLeaseRolloverDrilldown(
  leases: BundleLease[],
  options?: {
    windowMonths?: number;
  }
): LeaseRolloverDrilldown {
  const windowMonths = options?.windowMonths ?? 24;
  const eventMap = new Map<
    number,
    LeaseRolloverMonthRow & { mtmWeighted: number; mtmWeightKw: number }
  >();

  const modeledStarts = leases
    .map((lease) => {
      const lastStep = resolveLastEffectiveStep(lease.steps);
      const renewProbabilityPct = lastStep?.renewProbabilityPct ?? lease.renewProbabilityPct ?? 0;
      return renewProbabilityPct > 0
        ? toMonthIndex((lease.startYear ?? 1) + (lease.termYears ?? 1), 1)
        : null;
    })
    .filter((value): value is number => value !== null);

  const firstModeledMonthIndex = modeledStarts.length > 0 ? Math.min(...modeledStarts) : null;
  const lastModeledMonthIndex =
    firstModeledMonthIndex !== null ? firstModeledMonthIndex + windowMonths - 1 : null;

  for (const lease of leases) {
    const lastStep = resolveLastEffectiveStep(lease.steps);
    const expiringKw = lastStep?.leasedKw ?? lease.leasedKw ?? 0;
    const renewProbabilityPct = lastStep?.renewProbabilityPct ?? lease.renewProbabilityPct ?? 0;
    if (renewProbabilityPct <= 0 || expiringKw <= 0) continue;

    const rolloverDowntimeMonths = Math.max(
      0,
      Math.trunc(lastStep?.rolloverDowntimeMonths ?? lease.rolloverDowntimeMonths ?? 0)
    );
    const renewalRentFreeMonths = Math.max(
      0,
      Math.trunc(lastStep?.renewalRentFreeMonths ?? lease.renewalRentFreeMonths ?? 0)
    );
    const renewalTermYears = Math.max(
      1,
      Math.trunc(lastStep?.renewalTermYears ?? lease.renewalTermYears ?? lease.termYears ?? 1)
    );
    const renewalCount = Math.max(0, Math.trunc(lastStep?.renewalCount ?? lease.renewalCount ?? 1));
    const markToMarketRatePerKwKrw =
      lastStep?.markToMarketRatePerKwKrw ?? lease.markToMarketRatePerKwKrw ?? null;
    const renewalTenantCapitalCostKrw =
      (lastStep?.renewalTenantImprovementKrw ?? lease.renewalTenantImprovementKrw ?? 0) +
      (lastStep?.renewalLeasingCommissionKrw ?? lease.renewalLeasingCommissionKrw ?? 0);

    const firstRenewalYear = (lease.startYear ?? 1) + (lease.termYears ?? 1);

    for (let cycle = 0; cycle < renewalCount; cycle += 1) {
      const cycleStartYear = firstRenewalYear + cycle * renewalTermYears;
      const cycleStartMonthIndex = toMonthIndex(cycleStartYear, 1);
      if (
        firstModeledMonthIndex === null ||
        lastModeledMonthIndex === null ||
        cycleStartMonthIndex > lastModeledMonthIndex
      ) {
        continue;
      }

      for (let monthOffset = 0; monthOffset < rolloverDowntimeMonths; monthOffset += 1) {
        const monthIndex = cycleStartMonthIndex + monthOffset;
        if (monthIndex < firstModeledMonthIndex || monthIndex > lastModeledMonthIndex) continue;
        const current = eventMap.get(monthIndex) ?? {
          ...fromMonthIndex(monthIndex),
          monthIndex,
          downtimeKw: 0,
          rentFreeKw: 0,
          returningKw: 0,
          tenantCapitalCostKrw: 0,
          weightedMarkToMarketRatePerKwKrw: null,
          affectedLeaseCount: 0,
          leases: [],
          leaseRefs: [],
          mtmWeighted: 0,
          mtmWeightKw: 0
        };
        current.downtimeKw += expiringKw;
        if (!current.leases.includes(lease.tenantName)) {
          current.leases.push(lease.tenantName);
          current.leaseRefs.push({ id: lease.id, tenantName: lease.tenantName });
          current.affectedLeaseCount += 1;
        }
        eventMap.set(monthIndex, current);
      }

      for (let monthOffset = 0; monthOffset < renewalRentFreeMonths; monthOffset += 1) {
        const monthIndex = cycleStartMonthIndex + rolloverDowntimeMonths + monthOffset;
        if (
          firstModeledMonthIndex === null ||
          lastModeledMonthIndex === null ||
          monthIndex < firstModeledMonthIndex ||
          monthIndex > lastModeledMonthIndex
        ) {
          continue;
        }
        const current = eventMap.get(monthIndex) ?? {
          ...fromMonthIndex(monthIndex),
          monthIndex,
          downtimeKw: 0,
          rentFreeKw: 0,
          returningKw: 0,
          tenantCapitalCostKrw: 0,
          weightedMarkToMarketRatePerKwKrw: null,
          affectedLeaseCount: 0,
          leases: [],
          leaseRefs: [],
          mtmWeighted: 0,
          mtmWeightKw: 0
        };
        current.rentFreeKw += expiringKw;
        if (!current.leases.includes(lease.tenantName)) {
          current.leases.push(lease.tenantName);
          current.leaseRefs.push({ id: lease.id, tenantName: lease.tenantName });
          current.affectedLeaseCount += 1;
        }
        eventMap.set(monthIndex, current);
      }

      const returningMonthIndex =
        cycleStartMonthIndex + rolloverDowntimeMonths + renewalRentFreeMonths;
      if (
        firstModeledMonthIndex !== null &&
        lastModeledMonthIndex !== null &&
        returningMonthIndex >= firstModeledMonthIndex &&
        returningMonthIndex <= lastModeledMonthIndex
      ) {
        const current = eventMap.get(returningMonthIndex) ?? {
          ...fromMonthIndex(returningMonthIndex),
          monthIndex: returningMonthIndex,
          downtimeKw: 0,
          rentFreeKw: 0,
          returningKw: 0,
          tenantCapitalCostKrw: 0,
          weightedMarkToMarketRatePerKwKrw: null,
          affectedLeaseCount: 0,
          leases: [],
          leaseRefs: [],
          mtmWeighted: 0,
          mtmWeightKw: 0
        };
        current.returningKw += expiringKw;
        current.tenantCapitalCostKrw += renewalTenantCapitalCostKrw;
        if (markToMarketRatePerKwKrw !== null) {
          current.mtmWeighted += markToMarketRatePerKwKrw * expiringKw;
          current.mtmWeightKw += expiringKw;
          current.weightedMarkToMarketRatePerKwKrw = current.mtmWeighted / current.mtmWeightKw;
        }
        if (!current.leases.includes(lease.tenantName)) {
          current.leases.push(lease.tenantName);
          current.leaseRefs.push({ id: lease.id, tenantName: lease.tenantName });
          current.affectedLeaseCount += 1;
        }
        eventMap.set(returningMonthIndex, current);
      }
    }
  }

  const rows = [...eventMap.values()]
    .sort((left, right) => left.monthIndex - right.monthIndex)
    .map(({ mtmWeighted: _mtmWeighted, mtmWeightKw: _mtmWeightKw, ...row }) => row);

  return {
    firstModeledMonthIndex,
    windowMonths,
    peakDowntimeKw: rows.reduce((max, row) => Math.max(max, row.downtimeKw), 0),
    peakRentFreeKw: rows.reduce((max, row) => Math.max(max, row.rentFreeKw), 0),
    totalRenewalCapitalKrw: rows.reduce((sum, row) => sum + row.tenantCapitalCostKrw, 0),
    rows
  };
}
