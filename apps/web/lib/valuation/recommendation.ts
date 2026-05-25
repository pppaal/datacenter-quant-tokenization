export type ValuationRecommendation =
  | 'Proceed To Committee'
  | 'Proceed With Conditions'
  | 'Further Diligence Required';

/**
 * Maps a valuation confidence score to a committee recommendation.
 *
 * confidenceScore is on a 0-10 scale (the engine strategies clamp to ~4.5-9.9
 * and ConfidenceBreakdown renders "x / 10"). Keep this the single source of
 * truth — it previously lived as six copies that all used a 0-100 threshold,
 * so every asset always read "Further Diligence Required".
 */
export function getValuationRecommendation(
  confidenceScore?: number | null
): ValuationRecommendation {
  const score = confidenceScore ?? 0;
  if (score >= 7.5) return 'Proceed To Committee';
  if (score >= 5.5) return 'Proceed With Conditions';
  return 'Further Diligence Required';
}
