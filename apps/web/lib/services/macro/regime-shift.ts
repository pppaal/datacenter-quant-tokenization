/**
 * Regime-shift detection on macro/market time series.
 *
 * CRE time series often transition rather than drift — 2022 cap-rate
 * expansion, post-2020 vacancy jump in office, 2008 credit spread
 * blowout. A pure trend engine flags these as "accelerating" but misses
 * the qualitative "we are in a new regime" signal that changes position
 * sizing and hold assumptions.
 *
 * Algorithm — CUSUM on standardized residuals, plus a Welch-style mean
 * comparison on candidate split points:
 *
 *   1. Compute overall mean (μ) and stddev (σ) of the series.
 *   2. Standardize each observation to z = (x − μ) / σ.
 *   3. CUSUM walk: S_i = max(0, S_{i−1} + z_i − k), where k is the
 *      allowance (we use 0.5). S_i crossing threshold h (=4.0) flags a
 *      change point.
 *   4. For each candidate point, run a Welch t-test comparing the mean
 *      of the pre- and post-segments. Keep it if |t| > t_crit (≈2 for
 *      reasonable sample sizes).
 *
 * Returns at most the N highest-|t| change points so a long series
 * doesn't overwhelm downstream narrators.
 */

import type { MacroSeries } from '@prisma/client';

export type RegimeShift = {
  index: number;
  date: Date;
  preMean: number;
  postMean: number;
  preStdDev: number;
  postStdDev: number;
  meanShiftAbs: number;
  meanShiftZ: number;
  tStatistic: number;
  /** Magnitude of the shift in the series' own stddev units. */
  shiftMagnitude: 'MILD' | 'MODERATE' | 'EXTREME';
};

export type RegimeShiftReport = {
  seriesKey: string;
  observationCount: number;
  shifts: RegimeShift[];
  /** Series segmentation — one entry per regime, in chronological order. */
  segments: Array<{
    startIndex: number;
    endIndex: number;
    startDate: Date;
    endDate: Date;
    mean: number;
    stdDev: number;
    observationCount: number;
  }>;
};

type Observation = { date: Date; value: number };

const CUSUM_ALLOWANCE = 0.5;
const CUSUM_THRESHOLD = 4.0;
const T_CRITICAL = 2.0;
const MIN_SEGMENT_LENGTH = 4;
const MAX_SHIFTS_RETURNED = 5;

function toObservations(series: MacroSeries[], seriesKey: string): Observation[] {
  return series
    .filter((s) => s.seriesKey === seriesKey && s.value != null)
    .sort((a, b) => a.observationDate.getTime() - b.observationDate.getTime())
    .map((s) => ({ date: s.observationDate, value: s.value! }));
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function sampleStdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const sumSq = values.reduce((s, v) => s + (v - m) ** 2, 0);
  return Math.sqrt(sumSq / (values.length - 1));
}

function welchT(pre: number[], post: number[]): number {
  if (pre.length < 2 || post.length < 2) return 0;
  const m1 = mean(pre);
  const m2 = mean(post);
  const s1sq = pre.reduce((s, v) => s + (v - m1) ** 2, 0) / (pre.length - 1);
  const s2sq = post.reduce((s, v) => s + (v - m2) ** 2, 0) / (post.length - 1);
  const se = Math.sqrt(s1sq / pre.length + s2sq / post.length);
  if (se === 0) return 0;
  return (m2 - m1) / se;
}

function classifyMagnitude(zShift: number): RegimeShift['shiftMagnitude'] {
  const z = Math.abs(zShift);
  if (z >= 3) return 'EXTREME';
  if (z >= 1.5) return 'MODERATE';
  return 'MILD';
}

export function detectRegimeShifts(series: MacroSeries[], seriesKey: string): RegimeShiftReport {
  const obs = toObservations(series, seriesKey);
  const n = obs.length;
  if (n < MIN_SEGMENT_LENGTH * 2) {
    return {
      seriesKey,
      observationCount: n,
      shifts: [],
      segments:
        n > 0
          ? [
              {
                startIndex: 0,
                endIndex: n - 1,
                startDate: obs[0]!.date,
                endDate: obs[n - 1]!.date,
                mean: mean(obs.map((o) => o.value)),
                stdDev: sampleStdDev(obs.map((o) => o.value)),
                observationCount: n
              }
            ]
          : []
    };
  }

  const values = obs.map((o) => o.value);
  const mu = mean(values);
  const sigma = sampleStdDev(values);

  const candidateIndices: number[] = [];
  if (sigma > 0) {
    let cusumPos = 0;
    let cusumNeg = 0;
    for (let i = 0; i < n; i++) {
      const z = (values[i]! - mu) / sigma;
      cusumPos = Math.max(0, cusumPos + z - CUSUM_ALLOWANCE);
      cusumNeg = Math.min(0, cusumNeg + z + CUSUM_ALLOWANCE);
      if (cusumPos > CUSUM_THRESHOLD || cusumNeg < -CUSUM_THRESHOLD) {
        if (i >= MIN_SEGMENT_LENGTH && i <= n - MIN_SEGMENT_LENGTH) {
          candidateIndices.push(i);
        }
        cusumPos = 0;
        cusumNeg = 0;
      }
    }
  }

  const shifts: RegimeShift[] = [];
  for (const idx of candidateIndices) {
    const pre = values.slice(0, idx);
    const post = values.slice(idx);
    if (pre.length < MIN_SEGMENT_LENGTH || post.length < MIN_SEGMENT_LENGTH) continue;
    const t = welchT(pre, post);
    if (Math.abs(t) < T_CRITICAL) continue;
    const preMean = mean(pre);
    const postMean = mean(post);
    const preStd = sampleStdDev(pre);
    const postStd = sampleStdDev(post);
    const shiftAbs = postMean - preMean;
    // Pool within-segment stddev for magnitude scoring. Using overall σ
    // understates large step-changes because the step itself inflates σ.
    const pooledVar =
      ((pre.length - 1) * preStd * preStd + (post.length - 1) * postStd * postStd) /
      Math.max(1, pre.length + post.length - 2);
    const pooledStd = Math.sqrt(pooledVar);
    const scale = pooledStd > 1e-9 ? pooledStd : sigma;
    const shiftZ = scale > 0 ? shiftAbs / scale : 0;
    shifts.push({
      index: idx,
      date: obs[idx]!.date,
      preMean,
      postMean,
      preStdDev: preStd,
      postStdDev: postStd,
      meanShiftAbs: shiftAbs,
      meanShiftZ: shiftZ,
      tStatistic: t,
      shiftMagnitude: classifyMagnitude(shiftZ)
    });
  }

  // Rank by |t|, keep top N, then re-sort chronologically for segmentation.
  const topShifts = shifts
    .sort((a, b) => Math.abs(b.tStatistic) - Math.abs(a.tStatistic))
    .slice(0, MAX_SHIFTS_RETURNED)
    .sort((a, b) => a.index - b.index);

  const boundaries = [0, ...topShifts.map((s) => s.index), n];
  const segments: RegimeShiftReport['segments'] = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const start = boundaries[i]!;
    const end = boundaries[i + 1]! - 1;
    if (end < start) continue;
    const slice = values.slice(start, end + 1);
    segments.push({
      startIndex: start,
      endIndex: end,
      startDate: obs[start]!.date,
      endDate: obs[end]!.date,
      mean: mean(slice),
      stdDev: sampleStdDev(slice),
      observationCount: slice.length
    });
  }

  return {
    seriesKey,
    observationCount: n,
    shifts: topShifts,
    segments
  };
}
