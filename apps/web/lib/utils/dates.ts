/**
 * Shared date helpers. Centralized here so the same arithmetic is not
 * copy-pasted across service modules (it previously lived identically in
 * realized-outcomes, the property-analyzer backtest, and the forecast
 * backtest).
 */

/** Whole calendar days between two dates, rounded to the nearest day. */
export function differenceInDays(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}
