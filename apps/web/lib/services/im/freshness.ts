/**
 * Freshness band for any timestamped data point. The IM uses these
 * bands to color-code source pills and badges so the LP can spot
 * stale evidence at a glance.
 *
 * Cutoffs:
 *   < 7d  → fresh   (emerald)
 *   < 30d → recent  (amber)
 *   ≥ 30d → stale   (rose)
 *   null   → unknown
 */
export type FreshnessBand = 'fresh' | 'recent' | 'stale';

export type FreshnessAssessment = {
  band: FreshnessBand | null;
  ageDays: number | null;
  label: string;
};

const FRESH_DAYS = 7;
const RECENT_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

export function classifyFreshness(
  observedAt: Date | string | null | undefined,
  now: Date = new Date()
): FreshnessAssessment {
  if (!observedAt) {
    return { band: null, ageDays: null, label: 'unknown' };
  }
  const observedDate = observedAt instanceof Date ? observedAt : new Date(observedAt);
  if (Number.isNaN(observedDate.getTime())) {
    return { band: null, ageDays: null, label: 'unknown' };
  }
  const ageDays = Math.max(0, Math.floor((now.getTime() - observedDate.getTime()) / DAY_MS));
  let band: FreshnessBand;
  if (ageDays < FRESH_DAYS) band = 'fresh';
  else if (ageDays < RECENT_DAYS) band = 'recent';
  else band = 'stale';
  let label: string;
  if (ageDays === 0) label = 'today';
  else if (ageDays === 1) label = 'yesterday';
  else if (ageDays < 30) label = `${ageDays}d ago`;
  else if (ageDays < 365) label = `${Math.floor(ageDays / 30)}mo ago`;
  else label = `${Math.floor(ageDays / 365)}y ago`;
  return { band, ageDays, label };
}

export function freshnessTone(band: FreshnessBand | null): 'good' | 'warn' | 'risk' | null {
  if (band === 'fresh') return 'good';
  if (band === 'recent') return 'warn';
  if (band === 'stale') return 'risk';
  return null;
}
