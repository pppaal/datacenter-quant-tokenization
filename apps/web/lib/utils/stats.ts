/**
 * Shared numeric helpers. Centralized so the same reductions are not
 * copy-pasted across the forecast/backtest and macro modules.
 */

/** Arithmetic mean of `values`; returns 0 for an empty array. */
export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
