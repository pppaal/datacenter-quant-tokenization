/**
 * Translate a 0–5 hazard score to a friendly severity band.
 * Real hazard providers (FEMA, NASA-FIRMS, KMA, JRC) all settle on
 * roughly the same banding — these cutoffs match what shows up in
 * the seed and the engine's own penalty thresholds.
 */
export type HazardBand = 'minimal' | 'low' | 'moderate' | 'elevated' | 'high';

export function classifyHazardScore(score: number | null | undefined): HazardBand | null {
  if (typeof score !== 'number' || !Number.isFinite(score)) return null;
  if (score < 0.5) return 'minimal';
  if (score < 1.0) return 'low';
  if (score < 2.0) return 'moderate';
  if (score < 3.0) return 'elevated';
  return 'high';
}

const BAND_LABEL: Record<HazardBand, string> = {
  minimal: 'Minimal',
  low: 'Low',
  moderate: 'Moderate',
  elevated: 'Elevated',
  high: 'High'
};

const BAND_TONE: Record<HazardBand, 'good' | 'warn' | 'risk'> = {
  minimal: 'good',
  low: 'good',
  moderate: 'warn',
  elevated: 'warn',
  high: 'risk'
};

export function describeHazard(score: number | null | undefined): {
  band: HazardBand | null;
  label: string;
  tone: 'good' | 'warn' | 'risk' | null;
} {
  const band = classifyHazardScore(score);
  return {
    band,
    label: band ? BAND_LABEL[band] : '—',
    tone: band ? BAND_TONE[band] : null
  };
}
