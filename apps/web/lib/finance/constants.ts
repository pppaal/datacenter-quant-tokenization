/**
 * Single source of truth for cross-cutting finance constants.
 *
 * These literals were previously duplicated across valuation, waterfall,
 * and reporting modules. Centralizing them keeps behavior byte-identical
 * while removing the drift risk of hand-copied magic numbers.
 *
 * NOTE ON YEAR LENGTH: some call sites use 365.25 days (annualized
 * waterfall / comp time-adjustment) while others may use 365. Both are
 * exported so that migrating a site never silently changes its result.
 */

/** KRW per 억 (100 million). */
export const KRW_PER_EOK = 100_000_000;

/** KRW per 만 (10 thousand). */
export const KRW_PER_MAN = 10_000;

/** Days per year using the Julian average (accounts for leap years). */
export const DAYS_PER_YEAR_JULIAN = 365.25;

/** Days per year using a flat 360/365-style calendar year. */
export const DAYS_PER_YEAR = 365;

/** Milliseconds per (Julian) year. */
export const MS_PER_YEAR = DAYS_PER_YEAR_JULIAN * 24 * 60 * 60 * 1000;

/** Milliseconds per calendar day. */
export const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Default LP preferred-return hurdle, in percent per annum. */
export const DEFAULT_HURDLE_PCT = 8;

/** Default GP carried-interest percentage. */
export const DEFAULT_CARRY_PCT = 20;
