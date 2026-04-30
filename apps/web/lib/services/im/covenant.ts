/**
 * Covenant headroom + first-breach-year analysis. Pairs with the
 * 10-year projection from credit-analysis.ts so the IM can show
 * how close each ratio sits to its covenant threshold and which
 * year (if any) the projected path first breaches.
 */
import type { ProjectionRow } from '@/lib/services/im/credit-analysis';

export type CovenantHeadroom = {
  ratioKey: 'leverage' | 'interestCoverage';
  ratioLabel: string;
  benchmark: number;
  /** "lower" — value should stay below benchmark; "higher" — value should stay above. */
  preferred: 'higher' | 'lower';
  currentValue: number | null;
  /** Headroom as a percentage of the benchmark. Positive = inside the band. */
  headroomPct: number | null;
  /**
   * Year in the projection where the path first breaches the
   * covenant. null when no breach in horizon; 'now' when the
   * current value already breaches.
   */
  firstBreachYear: string | null;
  /** Worst observed value across the projection horizon. */
  worstValue: number | null;
  worstYear: string | null;
};

const COVENANTS = {
  leverage: { benchmark: 4.0, preferred: 'lower' as const, label: 'Leverage' },
  interestCoverage: {
    benchmark: 2.0,
    preferred: 'higher' as const,
    label: 'Interest coverage'
  }
};

function headroomFor(
  value: number | null,
  benchmark: number,
  preferred: 'higher' | 'lower'
): number | null {
  if (value === null) return null;
  if (preferred === 'lower') {
    return ((benchmark - value) / benchmark) * 100;
  }
  return ((value - benchmark) / benchmark) * 100;
}

function isBreach(
  value: number,
  benchmark: number,
  preferred: 'higher' | 'lower'
): boolean {
  return preferred === 'lower' ? value > benchmark : value < benchmark;
}

export function buildCovenantHeadroom(
  projection: ProjectionRow[]
): CovenantHeadroom[] {
  const out: CovenantHeadroom[] = [];

  (Object.keys(COVENANTS) as Array<keyof typeof COVENANTS>).forEach((key) => {
    const cov = COVENANTS[key];
    const current = projection[0]?.[key as 'leverage' | 'interestCoverage'] ?? null;
    let firstBreachYear: string | null = null;
    let worstValue: number | null = null;
    let worstYear: string | null = null;

    for (const row of projection) {
      const value = row[key as 'leverage' | 'interestCoverage'];
      if (value === null) continue;
      // Track the worst observed value over the horizon.
      const isWorse =
        worstValue === null ||
        (cov.preferred === 'lower' ? value > worstValue : value < worstValue);
      if (isWorse) {
        worstValue = value;
        worstYear = row.year;
      }
      if (firstBreachYear === null && isBreach(value, cov.benchmark, cov.preferred)) {
        firstBreachYear = row.year;
      }
    }

    out.push({
      ratioKey: key,
      ratioLabel: cov.label,
      benchmark: cov.benchmark,
      preferred: cov.preferred,
      currentValue: current,
      headroomPct: headroomFor(current, cov.benchmark, cov.preferred),
      firstBreachYear,
      worstValue,
      worstYear
    });
  });

  return out;
}

export type CovenantAlert = {
  ratioKey: string;
  ratioLabel: string;
  severity: 'critical' | 'warning' | 'watch';
  message: string;
  firstBreachYear: string | null;
  worstValue: number | null;
  worstYear: string | null;
};

/**
 * Translate covenant headroom output into committee-actionable
 * alerts. Severity is:
 *   critical — current value already breaches the covenant
 *   warning  — projected breach within the horizon
 *   watch    — headroom < 10% currently
 *
 * Used by both the IM (red banner) and the IC packet attachment
 * pipeline (when wired) to surface deals that need refinancing
 * provisions or covenant relief in the term sheet before close.
 */
export function buildCovenantAlerts(
  headroom: CovenantHeadroom[]
): CovenantAlert[] {
  const alerts: CovenantAlert[] = [];
  for (const h of headroom) {
    if (h.headroomPct === null) continue;
    if (h.headroomPct < 0) {
      alerts.push({
        ratioKey: h.ratioKey,
        ratioLabel: h.ratioLabel,
        severity: 'critical',
        message: `${h.ratioLabel} currently breaches covenant — relief or refinance required pre-close.`,
        firstBreachYear: 'now',
        worstValue: h.worstValue,
        worstYear: h.worstYear
      });
      continue;
    }
    if (h.firstBreachYear !== null) {
      alerts.push({
        ratioKey: h.ratioKey,
        ratioLabel: h.ratioLabel,
        severity: 'warning',
        message: `${h.ratioLabel} projected to breach in ${h.firstBreachYear}; cash sweep / spring covenant negotiated terms recommended.`,
        firstBreachYear: h.firstBreachYear,
        worstValue: h.worstValue,
        worstYear: h.worstYear
      });
      continue;
    }
    if (h.headroomPct < 10) {
      alerts.push({
        ratioKey: h.ratioKey,
        ratioLabel: h.ratioLabel,
        severity: 'watch',
        message: `${h.ratioLabel} headroom thin (${h.headroomPct.toFixed(1)}%); monitor at quarterly compliance.`,
        firstBreachYear: null,
        worstValue: h.worstValue,
        worstYear: h.worstYear
      });
    }
  }
  return alerts;
}
