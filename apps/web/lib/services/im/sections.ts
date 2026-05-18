/**
 * Render helpers for the sample IM (and future per-asset IM page).
 *
 * The data already exists on the asset bundle (macroSeries, leases,
 * debtFacilities, spvStructure, creditAssessments) — these helpers
 * shape it into the cards a REPE-grade IM expects.
 */
import type { AssetClass } from '@prisma/client';

type MacroSeriesPoint = {
  seriesKey: string;
  label: string;
  value: number;
  unit: string | null;
  observationDate: Date;
};

type LeaseLike = {
  tenantName: string;
  leasedKw: number;
  startYear: number;
  termYears: number;
  baseRatePerKwKrw: number;
  annualEscalationPct: number | null;
  markToMarketRatePerKwKrw?: number | null;
  status?: string | null;
};

type DebtFacilityLike = {
  facilityType: string;
  lenderName?: string | null;
  commitmentKrw: number | null;
  drawnAmountKrw: number | null;
  interestRatePct: number;
  amortizationProfile?: string | null;
};

type SpvStructureLike = {
  legalStructure?: string | null;
  managementFeePct?: number | null;
  performanceFeePct?: number | null;
  promoteThresholdPct?: number | null;
  promoteSharePct?: number | null;
  reserveTargetMonths?: number | null;
} | null;

type CreditAssessmentLike = {
  counterparty?: { name: string; role?: string | null } | null;
  score: number;
  riskLevel: string;
  summary: string | null;
};

const MACRO_HEADLINE_ORDER = [
  'kr.policy_rate_pct',
  'kr.gov_yield_3y_pct',
  'kr.gov_yield_10y_pct',
  'kr.cpi_yoy_pct',
  'kr.unemployment_pct',
  'kr.credit_spread_bps'
];

export function pickMacroBackdrop(series: MacroSeriesPoint[]): MacroSeriesPoint[] {
  if (series.length === 0) return [];
  // Pick the most recent observation per seriesKey, then order by the
  // canonical MACRO_HEADLINE_ORDER so the cover card always reads
  // "policy rate · yield · CPI · unemployment · credit spread".
  const latestByKey = new Map<string, MacroSeriesPoint>();
  for (const point of series) {
    const existing = latestByKey.get(point.seriesKey);
    if (!existing || point.observationDate.getTime() > existing.observationDate.getTime()) {
      latestByKey.set(point.seriesKey, point);
    }
  }
  const ordered: MacroSeriesPoint[] = [];
  for (const key of MACRO_HEADLINE_ORDER) {
    const found = latestByKey.get(key);
    if (found) ordered.push(found);
  }
  // Tail: any other series the asset has, in seen-order.
  for (const point of latestByKey.values()) {
    if (!ordered.includes(point)) ordered.push(point);
  }
  return ordered.slice(0, 6);
}

export function formatMacroValue(point: { value: number; unit: string | null }): string {
  if (point.unit === 'pct') return `${point.value.toFixed(2)}%`;
  if (point.unit === 'bps') return `${point.value.toFixed(0)} bps`;
  if (point.unit === 'idx') return point.value.toFixed(1);
  return Number.isInteger(point.value) ? point.value.toLocaleString() : point.value.toFixed(2);
}

export type WaltSummary = {
  totalLeasedKw: number;
  weightedAvgTermYears: number;
  weightedRentPerKwKrw: number;
  markToMarketGapPct: number | null;
  leaseCount: number;
};

// Lease statuses that count toward the underwritten WALT view. PIPELINE
// + SIGNED + ACTIVE + COMMITTED are all "underwritten" leases — the IM
// shows total committed-or-likely capacity, not just signed ones.
// EXPIRED / TERMINATED / CANCELLED are excluded.
const UNDERWRITTEN_LEASE_STATUSES = new Set([
  'PIPELINE',
  'SIGNED',
  'ACTIVE',
  'COMMITTED',
  'PROPOSED',
  'NEGOTIATING'
]);

export function computeLeaseRollSummary(leases: LeaseLike[]): WaltSummary {
  const active = leases.filter(
    (l) => !l.status || UNDERWRITTEN_LEASE_STATUSES.has(l.status.toUpperCase())
  );
  const totalLeasedKw = active.reduce((sum, l) => sum + l.leasedKw, 0);
  if (totalLeasedKw === 0) {
    return {
      totalLeasedKw: 0,
      weightedAvgTermYears: 0,
      weightedRentPerKwKrw: 0,
      markToMarketGapPct: null,
      leaseCount: leases.length
    };
  }
  const weightedTerm =
    active.reduce((sum, l) => sum + l.termYears * l.leasedKw, 0) / totalLeasedKw;
  const weightedRent =
    active.reduce((sum, l) => sum + l.baseRatePerKwKrw * l.leasedKw, 0) / totalLeasedKw;
  const mtmContributors = active.filter(
    (l) => typeof l.markToMarketRatePerKwKrw === 'number' && l.markToMarketRatePerKwKrw! > 0
  );
  const mtmGapPct =
    mtmContributors.length === 0
      ? null
      : (() => {
          const mtmKw = mtmContributors.reduce((sum, l) => sum + l.leasedKw, 0);
          const blendedMtm =
            mtmContributors.reduce(
              (sum, l) => sum + (l.markToMarketRatePerKwKrw ?? 0) * l.leasedKw,
              0
            ) / mtmKw;
          const blendedInPlace =
            mtmContributors.reduce((sum, l) => sum + l.baseRatePerKwKrw * l.leasedKw, 0) / mtmKw;
          if (blendedInPlace === 0) return null;
          return ((blendedMtm - blendedInPlace) / blendedInPlace) * 100;
        })();

  return {
    totalLeasedKw,
    weightedAvgTermYears: weightedTerm,
    weightedRentPerKwKrw: weightedRent,
    markToMarketGapPct: mtmGapPct,
    leaseCount: leases.length
  };
}

export type CapitalStructureSummary = {
  totalCommitmentKrw: number;
  totalDrawnKrw: number;
  blendedRatePct: number;
  facilityCount: number;
  // Leverage proxy: drawn debt / (drawn debt + equity placeholder). Real
  // LTV needs a value reference; we surface drawn vs commitment instead.
  drawnPctOfCommitment: number;
};

export function computeCapitalStructure(facilities: DebtFacilityLike[]): CapitalStructureSummary {
  if (facilities.length === 0) {
    return {
      totalCommitmentKrw: 0,
      totalDrawnKrw: 0,
      blendedRatePct: 0,
      facilityCount: 0,
      drawnPctOfCommitment: 0
    };
  }
  const totalCommitmentKrw = facilities.reduce((sum, f) => sum + (f.commitmentKrw ?? 0), 0);
  const totalDrawnKrw = facilities.reduce((sum, f) => sum + (f.drawnAmountKrw ?? 0), 0);
  // Weighted rate by COMMITMENT (not drawn) so an undrawn commitment
  // still contributes — this matches Bloomberg / lender presentations.
  const blendedRatePct =
    totalCommitmentKrw === 0
      ? 0
      : facilities.reduce(
          (sum, f) => sum + f.interestRatePct * (f.commitmentKrw ?? 0),
          0
        ) / totalCommitmentKrw;

  return {
    totalCommitmentKrw,
    totalDrawnKrw,
    blendedRatePct,
    facilityCount: facilities.length,
    drawnPctOfCommitment: totalCommitmentKrw === 0 ? 0 : (totalDrawnKrw / totalCommitmentKrw) * 100
  };
}

export type ReturnsSnapshot = {
  baseValueKrw: number;
  bullValueKrw: number;
  bearValueKrw: number;
  upsideToBullPct: number | null;
  downsideToBearPct: number | null;
  goingInYieldPct: number | null;
  exitCapPct: number | null;
  /** Min DSCR observed across the scenario set; lower-bound debt-service signal. */
  minDscr: number | null;
};

export function computeReturnsSnapshot(scenarios: Array<{
  name: string;
  valuationKrw: number;
  impliedYieldPct: number | null;
  exitCapRatePct: number | null;
  debtServiceCoverage: number | null;
}>): ReturnsSnapshot {
  const find = (name: string) => scenarios.find((s) => s.name.toLowerCase().includes(name));
  const base = find('base') ?? scenarios[1] ?? scenarios[0];
  const bull = find('bull') ?? scenarios[0];
  const bear = find('bear') ?? scenarios[scenarios.length - 1];

  const baseValueKrw = base?.valuationKrw ?? 0;
  const bullValueKrw = bull?.valuationKrw ?? 0;
  const bearValueKrw = bear?.valuationKrw ?? 0;

  const dscrs = scenarios
    .map((s) => s.debtServiceCoverage)
    .filter((v): v is number => typeof v === 'number');

  return {
    baseValueKrw,
    bullValueKrw,
    bearValueKrw,
    upsideToBullPct:
      baseValueKrw > 0 ? ((bullValueKrw - baseValueKrw) / baseValueKrw) * 100 : null,
    downsideToBearPct:
      baseValueKrw > 0 ? ((bearValueKrw - baseValueKrw) / baseValueKrw) * 100 : null,
    goingInYieldPct: base?.impliedYieldPct ?? null,
    exitCapPct: base?.exitCapRatePct ?? null,
    minDscr: dscrs.length === 0 ? null : Math.min(...dscrs)
  };
}

export type TenantCreditRollup = {
  count: number;
  averageScore: number;
  riskMix: Record<string, number>;
  highRiskNames: string[];
};

export function rollupTenantCredit(rows: CreditAssessmentLike[]): TenantCreditRollup {
  if (rows.length === 0) {
    return { count: 0, averageScore: 0, riskMix: {}, highRiskNames: [] };
  }
  const averageScore = rows.reduce((sum, r) => sum + r.score, 0) / rows.length;
  const riskMix: Record<string, number> = {};
  const highRiskNames: string[] = [];
  for (const row of rows) {
    riskMix[row.riskLevel] = (riskMix[row.riskLevel] ?? 0) + 1;
    if (row.riskLevel === 'HIGH' && row.counterparty?.name) {
      highRiskNames.push(row.counterparty.name);
    }
  }
  return { count: rows.length, averageScore, riskMix, highRiskNames };
}

export function describeAssetClass(assetClass: AssetClass | string): string {
  switch (assetClass) {
    case 'DATA_CENTER':
      return 'data-center';
    case 'OFFICE':
      return 'office';
    case 'INDUSTRIAL':
      return 'industrial / logistics';
    case 'RETAIL':
      return 'retail';
    case 'LAND':
      return 'land';
    default:
      return String(assetClass).toLowerCase().replace(/_/g, ' ');
  }
}

void undefined as unknown as SpvStructureLike;
