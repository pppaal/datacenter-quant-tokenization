/**
 * Seasonality detection for macro/market time series.
 *
 * KR CRE has strong calendar effects (year-end bid push, Q2 leasing ramp,
 * Chuseok-driven transaction troughs). A broker tear sheet eyeballs these;
 * a quant desk decomposes them so trend signal isn't confounded by season.
 *
 * Two tests are applied:
 *   1. **Autocorrelation at lag L** — a high ACF at lag-12 (monthly) or
 *      lag-4 (quarterly) after detrending is a direct seasonality marker.
 *   2. **F-test on seasonal means** — partition observations by month/
 *      quarter and check whether between-group variance dominates
 *      within-group variance (ratio > threshold).
 *
 * A series passes the seasonality gate only when both tests agree, so we
 * don't flag periodic noise as seasonality.
 */

import type { MacroSeries } from '@prisma/client';

export type SeasonalPeriod = 'MONTHLY' | 'QUARTERLY';

export type SeasonalityReport = {
  seriesKey: string;
  period: SeasonalPeriod;
  periodLength: number;
  hasSeasonality: boolean;
  autocorrelation: number;
  fRatio: number;
  /** seasonalIndex[i] = average deviation (%) from trend for period slot i. */
  seasonalIndex: number[];
  observationCount: number;
  reason: string;
};

type Observation = { date: Date; value: number };

// Autocorrelation threshold for seasonality (Pearson ρ at the seasonal lag).
// 0.30 picks up moderate patterns; tighten if false-positives matter.
const ACF_THRESHOLD = 0.3;
// F-ratio threshold — between-group / within-group variance. Values above
// ~1.5 indicate seasonal means are materially different across slots.
const F_RATIO_THRESHOLD = 1.5;
// Minimum number of full cycles we need to trust the estimate.
const MIN_CYCLES = 2;

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

/**
 * Linear detrend — subtract OLS fit. The seasonal component we're looking
 * for is the residual after removing linear drift, otherwise a rising
 * series will mask the seasonal ripple.
 */
function detrend(values: number[]): number[] {
  const n = values.length;
  if (n < 2) return values.slice();
  const xMean = (n - 1) / 2;
  const yMean = mean(values);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (values[i]! - yMean);
    den += (i - xMean) * (i - xMean);
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = yMean - slope * xMean;
  return values.map((v, i) => v - (intercept + slope * i));
}

function autocorrelation(values: number[], lag: number): number {
  const n = values.length;
  if (n <= lag + 1) return 0;
  const m = mean(values);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n - lag; i++) {
    num += (values[i]! - m) * (values[i + lag]! - m);
  }
  for (let i = 0; i < n; i++) {
    den += (values[i]! - m) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

function slotIndex(date: Date, period: SeasonalPeriod): number {
  return period === 'MONTHLY' ? date.getUTCMonth() : Math.floor(date.getUTCMonth() / 3);
}

/**
 * One-way ANOVA F-ratio on seasonal slot means. Larger → seasonal means
 * differ more than within-slot noise would explain.
 */
function seasonalFRatio(obs: Observation[], period: SeasonalPeriod, periodLength: number): number {
  const detrended = detrend(obs.map((o) => o.value));
  const slots: number[][] = Array.from({ length: periodLength }, () => []);
  for (let i = 0; i < obs.length; i++) {
    slots[slotIndex(obs[i]!.date, period)]!.push(detrended[i]!);
  }
  const populated = slots.filter((s) => s.length > 0);
  if (populated.length < 2) return 0;
  const grandMean = mean(detrended);
  let between = 0;
  let within = 0;
  let dfBetween = 0;
  let dfWithin = 0;
  for (const slot of populated) {
    const sm = mean(slot);
    between += slot.length * (sm - grandMean) ** 2;
    for (const v of slot) within += (v - sm) ** 2;
    dfBetween += 1;
    dfWithin += slot.length - 1;
  }
  dfBetween -= 1;
  if (dfBetween <= 0 || dfWithin <= 0 || within === 0) return 0;
  const msBetween = between / dfBetween;
  const msWithin = within / dfWithin;
  return msBetween / msWithin;
}

function seasonalIndexVector(
  obs: Observation[],
  period: SeasonalPeriod,
  periodLength: number,
  rawMean: number
): number[] {
  // Seasonal deviations are computed on the detrended residuals (mean ≈ 0),
  // but expressed as a percentage of the raw scale so downstream consumers
  // get an interpretable number like "Q4 is +6% above average".
  const detrended = detrend(obs.map((o) => o.value));
  const slotSums: number[] = Array(periodLength).fill(0);
  const slotCounts: number[] = Array(periodLength).fill(0);
  for (let i = 0; i < obs.length; i++) {
    const idx = slotIndex(obs[i]!.date, period);
    slotSums[idx] += detrended[i]!;
    slotCounts[idx] += 1;
  }
  const denom = Math.abs(rawMean) > 1e-9 ? Math.abs(rawMean) : 1;
  return slotSums.map((sum, i) => {
    if (slotCounts[i] === 0) return 0;
    const slotMean = sum / slotCounts[i]!;
    return (slotMean / denom) * 100;
  });
}

/**
 * Infer how many observations make up one seasonal cycle (one year) based
 * on the median interval between consecutive observations. Monthly data →
 * 12 obs per year; quarterly → 4; annual or coarser → 1. This is what we
 * pass to the ACF: same slot, previous cycle.
 */
function inferCycleObs(obs: Observation[]): number {
  if (obs.length < 2) return 12;
  const deltas: number[] = [];
  for (let i = 1; i < obs.length; i++) {
    deltas.push(obs[i]!.date.getTime() - obs[i - 1]!.date.getTime());
  }
  deltas.sort((a, b) => a - b);
  const medianMs = deltas[Math.floor(deltas.length / 2)]!;
  const medianDays = medianMs / (1000 * 60 * 60 * 24);
  if (medianDays < 45) return 12;
  if (medianDays < 120) return 4;
  return 1;
}

export function detectSeasonality(
  series: MacroSeries[],
  seriesKey: string,
  period: SeasonalPeriod = 'MONTHLY'
): SeasonalityReport {
  const obs = toObservations(series, seriesKey);
  const periodLength = period === 'MONTHLY' ? 12 : 4;
  const base: SeasonalityReport = {
    seriesKey,
    period,
    periodLength,
    hasSeasonality: false,
    autocorrelation: 0,
    fRatio: 0,
    seasonalIndex: Array(periodLength).fill(0),
    observationCount: obs.length,
    reason: ''
  };
  const cycleObs = inferCycleObs(obs);
  const minObs = Math.max(periodLength, cycleObs) * MIN_CYCLES;
  if (obs.length < minObs) {
    return { ...base, reason: `need at least ${minObs} observations; have ${obs.length}` };
  }
  const rawMean = mean(obs.map((o) => o.value));
  const detrended = detrend(obs.map((o) => o.value));
  const acf = autocorrelation(detrended, cycleObs);
  const fRatio = seasonalFRatio(obs, period, periodLength);
  const seasonalIndex = seasonalIndexVector(obs, period, periodLength, rawMean);
  const hasSeasonality = acf >= ACF_THRESHOLD && fRatio >= F_RATIO_THRESHOLD;
  const reason = hasSeasonality
    ? `ACF(lag=${cycleObs})=${acf.toFixed(2)} ≥ ${ACF_THRESHOLD} and F=${fRatio.toFixed(2)} ≥ ${F_RATIO_THRESHOLD}`
    : `ACF(lag=${cycleObs})=${acf.toFixed(2)} (threshold ${ACF_THRESHOLD}); F=${fRatio.toFixed(2)} (threshold ${F_RATIO_THRESHOLD})`;
  return {
    seriesKey,
    period,
    periodLength,
    hasSeasonality,
    autocorrelation: acf,
    fRatio,
    seasonalIndex,
    observationCount: obs.length,
    reason
  };
}

export function deseasonalize(
  series: MacroSeries[],
  seriesKey: string,
  report: SeasonalityReport
): Array<{ date: Date; raw: number; deseasonalized: number }> {
  const obs = toObservations(series, seriesKey);
  if (!report.hasSeasonality) {
    return obs.map((o) => ({ date: o.date, raw: o.value, deseasonalized: o.value }));
  }
  const rawMean = mean(obs.map((o) => o.value));
  const denom = Math.abs(rawMean) > 1e-9 ? Math.abs(rawMean) : 1;
  return obs.map((o) => {
    const slot = slotIndex(o.date, report.period);
    const adjPct = report.seasonalIndex[slot] ?? 0;
    const adjAbs = (adjPct / 100) * denom;
    return { date: o.date, raw: o.value, deseasonalized: o.value - adjAbs };
  });
}
