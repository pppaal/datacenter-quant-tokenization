import type { BundleLease, BundleLeaseStep } from '@/lib/services/valuation/types';

export type TenantConcentrationRow = {
  tenantName: string;
  annualIncomeKrw: number;
  incomeSharePct: number;
  leasedKw: number;
  expiryYear: number | null;
};

export type LeasingAnalytics = {
  tenantCount: number;
  totalContractedKw: number;
  inPlaceAnnualIncomeKrw: number;
  /** Weighted Average Lease Term (contracted), weighted by annual income. */
  waltByIncomeYears: number | null;
  /** WALT weighted by leased capacity (area proxy). */
  waltByAreaYears: number | null;
  topTenantSharePct: number | null;
  topThreeSharePct: number | null;
  /** Herfindahl-Hirschman index on income share (0–1). */
  herfindahlIndex: number | null;
  diversificationLabel:
    | 'Well diversified'
    | 'Moderate'
    | 'Concentrated'
    | 'Single-tenant risk'
    | null;
  /** Income expiring within the near-term window, as % of in-place income. */
  nearTermRolloverSharePct: number | null;
  nearTermYears: number;
  latestExpiryYear: number | null;
  weightedMarkToMarketRatePerKwKrw: number | null;
  inPlaceWeightedRatePerKwKrw: number | null;
  rows: TenantConcentrationRow[];
};

function lastEffectiveStep(steps: BundleLeaseStep[]): BundleLeaseStep | undefined {
  if (steps.length === 0) return undefined;
  return [...steps].sort((a, b) => {
    if (a.endYear !== b.endYear) return b.endYear - a.endYear;
    return b.stepOrder - a.stepOrder;
  })[0];
}

function diversificationLabel(hhi: number | null): LeasingAnalytics['diversificationLabel'] {
  if (hhi === null) return null;
  if (hhi < 0.15) return 'Well diversified';
  if (hhi < 0.25) return 'Moderate';
  if (hhi < 0.5) return 'Concentrated';
  return 'Single-tenant risk';
}

/**
 * Portfolio-leasing roll-up from the persisted (kW-priced) lease book: WALT by
 * income and by capacity, in-place income, tenant concentration (top-1 / top-3
 * / HHI), and near-term rollover as a share of income. Pure derivation — no new
 * data. Income per lease uses the last effective rent step (rate × kW × 12),
 * falling back to the lease headline rate.
 */
export function buildLeasingAnalytics(
  leases: BundleLease[],
  options?: { nearTermYears?: number }
): LeasingAnalytics {
  const nearTermYears = options?.nearTermYears ?? 3;

  const perLease = leases.map((lease) => {
    const step = lastEffectiveStep(lease.steps);
    const kw = step?.leasedKw ?? lease.leasedKw ?? 0;
    const ratePerKw = step?.ratePerKwKrw ?? lease.baseRatePerKwKrw ?? 0;
    const annualIncomeKrw = kw > 0 && ratePerKw > 0 ? kw * ratePerKw * 12 : 0;
    const termYears = lease.termYears ?? null;
    const expiryYear =
      lease.startYear != null && lease.termYears != null
        ? lease.startYear + lease.termYears - 1
        : null;
    const mtm = step?.markToMarketRatePerKwKrw ?? lease.markToMarketRatePerKwKrw ?? null;
    return { lease, kw, ratePerKw, annualIncomeKrw, termYears, expiryYear, mtm };
  });

  const totalContractedKw = perLease.reduce((sum, l) => sum + l.kw, 0);
  const inPlaceAnnualIncomeKrw = perLease.reduce((sum, l) => sum + l.annualIncomeKrw, 0);

  // WALT by income / by area (only over leases with a known term).
  let incomeTermWeighted = 0;
  let incomeTermWeight = 0;
  let areaTermWeighted = 0;
  let areaTermWeight = 0;
  let mtmWeighted = 0;
  let mtmWeight = 0;
  for (const l of perLease) {
    if (l.termYears != null) {
      incomeTermWeighted += l.termYears * l.annualIncomeKrw;
      incomeTermWeight += l.annualIncomeKrw;
      areaTermWeighted += l.termYears * l.kw;
      areaTermWeight += l.kw;
    }
    if (l.mtm != null && l.kw > 0) {
      mtmWeighted += l.mtm * l.kw;
      mtmWeight += l.kw;
    }
  }

  // Income aggregated by tenant (name) for concentration.
  const byTenant = new Map<string, { income: number; kw: number; expiryYear: number | null }>();
  for (const l of perLease) {
    const key = l.lease.tenantName || 'Unnamed tenant';
    const existing = byTenant.get(key) ?? { income: 0, kw: 0, expiryYear: l.expiryYear };
    existing.income += l.annualIncomeKrw;
    existing.kw += l.kw;
    existing.expiryYear =
      existing.expiryYear == null
        ? l.expiryYear
        : l.expiryYear == null
          ? existing.expiryYear
          : Math.max(existing.expiryYear, l.expiryYear);
    byTenant.set(key, existing);
  }

  const rows: TenantConcentrationRow[] = [...byTenant.entries()]
    .map(([tenantName, v]) => ({
      tenantName,
      annualIncomeKrw: v.income,
      incomeSharePct: inPlaceAnnualIncomeKrw > 0 ? (v.income / inPlaceAnnualIncomeKrw) * 100 : 0,
      leasedKw: v.kw,
      expiryYear: v.expiryYear
    }))
    .sort((a, b) => b.annualIncomeKrw - a.annualIncomeKrw);

  const topTenantSharePct = rows.length ? rows[0].incomeSharePct : null;
  const topThreeSharePct = rows.length
    ? rows.slice(0, 3).reduce((sum, r) => sum + r.incomeSharePct, 0)
    : null;
  const herfindahlIndex =
    inPlaceAnnualIncomeKrw > 0 && rows.length
      ? rows.reduce((sum, r) => sum + Math.pow(r.incomeSharePct / 100, 2), 0)
      : null;

  // Near-term rollover share of income: income expiring within nearTermYears of
  // the earliest expiry on the schedule.
  const expiryYears = perLease
    .map((l) => l.expiryYear)
    .filter((y): y is number => typeof y === 'number');
  const earliestExpiry = expiryYears.length ? Math.min(...expiryYears) : null;
  const latestExpiryYear = expiryYears.length ? Math.max(...expiryYears) : null;
  const nearTermRolloverSharePct =
    earliestExpiry != null && inPlaceAnnualIncomeKrw > 0
      ? (perLease
          .filter((l) => l.expiryYear != null && l.expiryYear <= earliestExpiry + nearTermYears - 1)
          .reduce((sum, l) => sum + l.annualIncomeKrw, 0) /
          inPlaceAnnualIncomeKrw) *
        100
      : null;

  return {
    tenantCount: byTenant.size,
    totalContractedKw,
    inPlaceAnnualIncomeKrw,
    waltByIncomeYears: incomeTermWeight > 0 ? incomeTermWeighted / incomeTermWeight : null,
    waltByAreaYears: areaTermWeight > 0 ? areaTermWeighted / areaTermWeight : null,
    topTenantSharePct,
    topThreeSharePct,
    herfindahlIndex,
    diversificationLabel: diversificationLabel(herfindahlIndex),
    nearTermRolloverSharePct,
    nearTermYears,
    latestExpiryYear,
    weightedMarkToMarketRatePerKwKrw: mtmWeight > 0 ? mtmWeighted / mtmWeight : null,
    inPlaceWeightedRatePerKwKrw:
      totalContractedKw > 0 ? inPlaceAnnualIncomeKrw / (totalContractedKw * 12) : null,
    rows
  };
}
