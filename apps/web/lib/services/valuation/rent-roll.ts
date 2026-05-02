/**
 * Tenant-level rent roll & 10-year cash flow projection.
 *
 * Each tenant contributes:
 *   - contracted rent through lease expiry
 *   - at expiry: renewal (with probability `renewalProb`) or downtime + re-lease
 *   - annual rent bumps (`rentBumpPct`)
 *   - expiry roll: market rent reset, with mark-to-market gap modeling
 *   - TI/LC cost at lease roll (both renewal and new leasing)
 *   - free-rent period at new lease start
 *
 * Output is both an aggregated NOI series (for pro-forma integration) and a
 * per-tenant-per-year grid for rent-roll reporting.
 *
 * This module intentionally does not model the full stacking-plan UI (that's
 * a downstream concern). It takes a list of tenants and market inputs and
 * produces deterministic year-by-year rent revenue.
 */

export type RentRollTenant = {
  tenantId: string;
  name: string;
  gfaSqm: number;
  /** Monthly rent per sqm (KRW/sqm/mo). */
  currentRentPerSqmMonthly: number;
  /** Absolute start date is not needed; we model relative to underwriting year 1. */
  leaseExpiryYear: number;
  rentBumpPct: number;
  renewalProbabilityPct: number;
  /** Mark-to-market gap at roll. +10 means market is 10% above current rent. */
  markToMarketGapPct: number;
  /** Downtime between leases if not renewed (months). */
  downtimeMonths: number;
  /** Free rent granted at new lease start (months). */
  freeRentMonths: number;
  /** TI allowance per sqm on new leasing (KRW/sqm). */
  tiPerSqmNew: number;
  /** TI on renewal, typically 30-50% of new. */
  tiPerSqmRenewal: number;
  /** Leasing commission as pct of 1st-year rent. */
  leasingCommissionPct: number;
};

export type RentRollYearRow = {
  year: number;
  totalRentKrw: number;
  totalTiLcKrw: number;
  occupancyPct: number;
  rollingTenantCount: number;
  expiringGfaSqm: number;
  tenants: Array<{
    tenantId: string;
    rentKrw: number;
    tiLcKrw: number;
    state: 'IN_PLACE' | 'RENEWED' | 'NEW_LEASE' | 'DOWNTIME' | 'VACANT';
    effectiveRentPerSqmMonthly: number;
  }>;
};

export type RentRollProjection = {
  years: RentRollYearRow[];
  totalGfaSqm: number;
  totalRentYear1Krw: number;
  tenantCount: number;
  averageRenewalProbabilityPct: number;
  totalTiLcOverHoldKrw: number;
  worstYearOccupancyPct: number;
  worstYearNumber: number | null;
};

const MONTHS_PER_YEAR = 12;

// Deterministic pseudo-random for renewal outcome (stable across re-runs for
// same tenant+expiry year — keeps the pro-forma reproducible).
function tenantRenewsDeterministic(tenantId: string, expiryYear: number, probPct: number): boolean {
  let hash = 0;
  const key = `${tenantId}-${expiryYear}`;
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
    hash |= 0;
  }
  const normalized = Math.abs(hash % 10000) / 100; // 0-100
  return normalized < probPct;
}

export function projectRentRoll(tenants: RentRollTenant[], holdYears: number): RentRollProjection {
  const totalGfa = tenants.reduce((s, t) => s + t.gfaSqm, 0);
  const years: RentRollYearRow[] = [];
  let totalTiLc = 0;
  let worstOccupancy = 100;
  let worstYear: number | null = null;

  // Per-tenant mutable state
  type TenantState = {
    tenant: RentRollTenant;
    currentRentPerSqmMonthly: number;
    nextExpiryYear: number;
    downtimeRemainingMonths: number;
    freeRentRemainingMonths: number;
  };

  const states: TenantState[] = tenants.map((t) => ({
    tenant: t,
    currentRentPerSqmMonthly: t.currentRentPerSqmMonthly,
    nextExpiryYear: t.leaseExpiryYear,
    downtimeRemainingMonths: 0,
    freeRentRemainingMonths: 0
  }));

  for (let yearNum = 1; yearNum <= holdYears; yearNum++) {
    const rowTenants: RentRollYearRow['tenants'] = [];
    let rentThisYear = 0;
    let tiLcThisYear = 0;
    let occupiedGfa = 0;
    let rollingCount = 0;
    let expiringGfa = 0;

    for (const s of states) {
      const t = s.tenant;
      let paidMonths = MONTHS_PER_YEAR;
      let state: RentRollYearRow['tenants'][number]['state'] = 'IN_PLACE';
      let tiLc = 0;

      // Bump in-place rent first (escalator applies to existing lease).
      s.currentRentPerSqmMonthly *= 1 + t.rentBumpPct / 100;

      // Consume downtime first.
      if (s.downtimeRemainingMonths > 0) {
        const consume = Math.min(s.downtimeRemainingMonths, paidMonths);
        paidMonths -= consume;
        s.downtimeRemainingMonths -= consume;
        state = 'DOWNTIME';
      }

      // Lease expiry in this year?
      if (yearNum === s.nextExpiryYear) {
        rollingCount += 1;
        expiringGfa += t.gfaSqm;
        const renews = tenantRenewsDeterministic(t.tenantId, yearNum, t.renewalProbabilityPct);
        // Mark-to-market reset — clamp to floor 70% / cap 130% of current rent.
        const mtmRent = s.currentRentPerSqmMonthly * (1 + t.markToMarketGapPct / 100);
        const floor = s.currentRentPerSqmMonthly * 0.7;
        const cap = s.currentRentPerSqmMonthly * 1.3;
        s.currentRentPerSqmMonthly = Math.max(floor, Math.min(cap, mtmRent));

        if (renews) {
          state = 'RENEWED';
          tiLc += t.gfaSqm * t.tiPerSqmRenewal;
          // Small free rent bump on renewal
          s.freeRentRemainingMonths = Math.round(t.freeRentMonths * 0.3);
        } else {
          state = 'NEW_LEASE';
          tiLc += t.gfaSqm * t.tiPerSqmNew;
          s.downtimeRemainingMonths = t.downtimeMonths;
          s.freeRentRemainingMonths = t.freeRentMonths;
        }
        // Leasing commission = LC% × year-1 rent at new rate
        const year1Rent = s.currentRentPerSqmMonthly * t.gfaSqm * 12;
        tiLc += year1Rent * (t.leasingCommissionPct / 100);
        // Set next expiry — assume 5 year default term on roll
        s.nextExpiryYear = yearNum + 5;
      }

      // Consume free rent
      if (s.freeRentRemainingMonths > 0 && paidMonths > 0) {
        const consume = Math.min(s.freeRentRemainingMonths, paidMonths);
        paidMonths -= consume;
        s.freeRentRemainingMonths -= consume;
      }

      const tenantRent = Math.max(
        0,
        Math.round(s.currentRentPerSqmMonthly * t.gfaSqm * paidMonths)
      );
      const effectiveRent =
        paidMonths > 0 ? Math.round((tenantRent / t.gfaSqm / paidMonths) * (paidMonths / 12)) : 0;

      if (paidMonths === 0) state = 'VACANT';
      if (paidMonths === MONTHS_PER_YEAR && state === 'IN_PLACE') occupiedGfa += t.gfaSqm;
      else if (paidMonths > 0) occupiedGfa += t.gfaSqm * (paidMonths / MONTHS_PER_YEAR);

      rentThisYear += tenantRent;
      tiLcThisYear += Math.round(tiLc);

      rowTenants.push({
        tenantId: t.tenantId,
        rentKrw: tenantRent,
        tiLcKrw: Math.round(tiLc),
        state,
        effectiveRentPerSqmMonthly: effectiveRent
      });
    }

    const occupancyPct = totalGfa > 0 ? Number(((occupiedGfa / totalGfa) * 100).toFixed(2)) : 0;
    if (occupancyPct < worstOccupancy) {
      worstOccupancy = occupancyPct;
      worstYear = yearNum;
    }
    totalTiLc += tiLcThisYear;

    years.push({
      year: yearNum,
      totalRentKrw: rentThisYear,
      totalTiLcKrw: tiLcThisYear,
      occupancyPct,
      rollingTenantCount: rollingCount,
      expiringGfaSqm: expiringGfa,
      tenants: rowTenants
    });
  }

  const avgRenewalProb =
    tenants.length > 0
      ? tenants.reduce((s, t) => s + t.renewalProbabilityPct, 0) / tenants.length
      : 0;

  return {
    years,
    totalGfaSqm: totalGfa,
    totalRentYear1Krw: years[0]?.totalRentKrw ?? 0,
    tenantCount: tenants.length,
    averageRenewalProbabilityPct: Number(avgRenewalProb.toFixed(2)),
    totalTiLcOverHoldKrw: totalTiLc,
    worstYearOccupancyPct: Number(worstOccupancy.toFixed(2)),
    worstYearNumber: worstYear
  };
}

/**
 * Synthesize a plausible rent roll from a top-down NOI assumption. Used when
 * we don't yet have real tenant data but want to exercise the model on mock
 * properties — splits the building across 3 tenant sizes with staggered expiries.
 */
export function synthesizeRentRoll(params: {
  totalGfaSqm: number;
  year1NoiKrw: number;
  opexRatio: number;
  averageRentPerSqmMonthly?: number;
  marketRentGrowthPct?: number;
}): RentRollTenant[] {
  const revenue = params.year1NoiKrw / (1 - params.opexRatio);
  const impliedRentPerSqmMonthly =
    params.averageRentPerSqmMonthly ?? Math.round(revenue / params.totalGfaSqm / 12);

  // Split: 50% anchor (long lease), 30% mid (medium), 20% small (short)
  return [
    {
      tenantId: 'anchor',
      name: 'Anchor Tenant',
      gfaSqm: Math.round(params.totalGfaSqm * 0.5),
      currentRentPerSqmMonthly: Math.round(impliedRentPerSqmMonthly * 0.95),
      leaseExpiryYear: 7,
      rentBumpPct: 3,
      renewalProbabilityPct: 75,
      markToMarketGapPct: params.marketRentGrowthPct ?? 2,
      downtimeMonths: 6,
      freeRentMonths: 3,
      tiPerSqmNew: 800_000,
      tiPerSqmRenewal: 300_000,
      leasingCommissionPct: 10
    },
    {
      tenantId: 'mid',
      name: 'Mid Tenant',
      gfaSqm: Math.round(params.totalGfaSqm * 0.3),
      currentRentPerSqmMonthly: Math.round(impliedRentPerSqmMonthly * 1.0),
      leaseExpiryYear: 4,
      rentBumpPct: 3,
      renewalProbabilityPct: 60,
      markToMarketGapPct: params.marketRentGrowthPct ?? 2,
      downtimeMonths: 4,
      freeRentMonths: 2,
      tiPerSqmNew: 600_000,
      tiPerSqmRenewal: 200_000,
      leasingCommissionPct: 8
    },
    {
      tenantId: 'small',
      name: 'Small Tenants',
      gfaSqm: Math.round(params.totalGfaSqm * 0.2),
      currentRentPerSqmMonthly: Math.round(impliedRentPerSqmMonthly * 1.1),
      leaseExpiryYear: 2,
      rentBumpPct: 3,
      renewalProbabilityPct: 50,
      markToMarketGapPct: params.marketRentGrowthPct ?? 2,
      downtimeMonths: 3,
      freeRentMonths: 1,
      tiPerSqmNew: 400_000,
      tiPerSqmRenewal: 100_000,
      leasingCommissionPct: 6
    }
  ];
}
