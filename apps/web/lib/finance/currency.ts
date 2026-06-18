import { KRW_PER_EOK } from './constants';

export const supportedCurrencies = ['KRW', 'USD', 'EUR', 'JPY', 'SGD', 'GBP'] as const;

export type SupportedCurrency = (typeof supportedCurrencies)[number];

const countryCurrencyMap: Record<string, SupportedCurrency> = {
  KR: 'KRW',
  US: 'USD',
  GB: 'GBP',
  UK: 'GBP',
  JP: 'JPY',
  SG: 'SGD',
  DE: 'EUR',
  FR: 'EUR',
  ES: 'EUR',
  IT: 'EUR',
  NL: 'EUR',
  IE: 'EUR'
};

const defaultFxRatesToKrw: Record<SupportedCurrency, number> = {
  KRW: 1,
  USD: 1350,
  EUR: 1470,
  JPY: 9.1,
  SGD: 1000,
  GBP: 1715
};

function normalizeCurrencyCode(value?: string | null): SupportedCurrency | null {
  if (!value) return null;
  const upper = value.trim().toUpperCase();
  return supportedCurrencies.includes(upper as SupportedCurrency)
    ? (upper as SupportedCurrency)
    : null;
}

export function resolveCurrencyFromCountry(country?: string | null): SupportedCurrency {
  const upper = country?.trim().toUpperCase();
  if (upper && countryCurrencyMap[upper]) return countryCurrencyMap[upper];
  return 'KRW';
}

export function resolveDisplayCurrency(countryOrMarket?: string | null) {
  return resolveCurrencyFromCountry(countryOrMarket);
}

export function resolveInputCurrency(
  country?: string | null,
  inputCurrency?: string | null
): SupportedCurrency {
  return normalizeCurrencyCode(inputCurrency) ?? resolveCurrencyFromCountry(country);
}

export function getDefaultFxRateToKrw(currency: SupportedCurrency) {
  return defaultFxRatesToKrw[currency];
}

export function getFxRateToKrw(currency: SupportedCurrency, env: NodeJS.ProcessEnv = process.env) {
  if (currency === 'KRW') return 1;
  const envKey = `FX_${currency}_KRW`;
  const envValue = env[envKey];
  if (envValue) {
    const parsed = Number(envValue);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return getDefaultFxRateToKrw(currency);
}

export function convertToKrw(
  amount: number | undefined,
  currency: SupportedCurrency,
  env: NodeJS.ProcessEnv = process.env
) {
  if (amount === undefined || !Number.isFinite(amount)) return undefined;
  return Math.round(amount * getFxRateToKrw(currency, env));
}

export function convertFromKrw(
  amountKrw: number | null | undefined,
  currency: SupportedCurrency,
  env: NodeJS.ProcessEnv = process.env
) {
  if (amountKrw === null || amountKrw === undefined || !Number.isFinite(amountKrw)) return null;
  if (currency === 'KRW') return amountKrw;
  return amountKrw / getFxRateToKrw(currency, env);
}

export function convertFromKrwAtRate(
  amountKrw: number | null | undefined,
  currency: SupportedCurrency,
  rateToKrw?: number | null,
  env: NodeJS.ProcessEnv = process.env
) {
  if (amountKrw === null || amountKrw === undefined || !Number.isFinite(amountKrw)) return null;
  if (currency === 'KRW') return amountKrw;
  const effectiveRate =
    rateToKrw && Number.isFinite(rateToKrw) && rateToKrw > 0
      ? rateToKrw
      : getFxRateToKrw(currency, env);
  return amountKrw / effectiveRate;
}

// ---------------------------------------------------------------------------
// Compact KRW formatters (single source of truth)
//
// Several services previously defined their own `(krw/1e8).toFixed(1)+'억'`
// style helper with subtly different tiers, decimal places, suffixes and
// prefixes. These helpers are parameterized so each call site keeps its
// EXACT prior output — do not "normalize" the rounding without auditing
// every consumer's snapshot.
// ---------------------------------------------------------------------------

/**
 * Format an amount in KRW as 억 (hundred-millions).
 *
 * @example formatEok(150_000_000) // "1.5억"
 */
export function formatEok(
  krw: number,
  { dp = 1, suffix = '억', prefix = '' }: { dp?: number; suffix?: string; prefix?: string } = {}
): string {
  return `${prefix}${(krw / KRW_PER_EOK).toFixed(dp)}${suffix}`;
}

/**
 * Format a KRW amount as billions (₩…B), one decimal place. Used by the
 * LP investor reports, which display USD-style billions rather than 억.
 *
 * @example formatKrwBillions(1_500_000_000) // "₩1.5B"
 */
export function formatKrwBillions(value: number): string {
  return `₩${(value / 1_000_000_000).toFixed(1)}B`;
}

/** A single magnitude tier for {@link formatKrwCompact}. */
export type KrwCompactTier = {
  /** Inclusive lower bound on `Math.abs(krw)` for this tier to apply. */
  min: number;
  /** Divisor applied to the (signed) amount before formatting. */
  divisor: number;
  /** Decimal places passed to `toFixed`. */
  dp: number;
  /** Suffix appended after the number. */
  suffix: string;
};

/**
 * Format a KRW amount by selecting the first tier whose `min` is <=
 * `Math.abs(krw)`, then `(krw / tier.divisor).toFixed(tier.dp) + suffix`.
 * Falls back to `fallback(krw)` when no tier matches.
 *
 * `prefix` is prepended to BOTH the tier output and the fallback output,
 * matching the existing call sites (e.g. the `₩` in refinancing).
 */
export function formatKrwCompact(
  krw: number,
  options: {
    tiers: KrwCompactTier[];
    fallback: (krw: number) => string;
    prefix?: string;
  }
): string {
  const { tiers, fallback, prefix = '' } = options;
  const abs = Math.abs(krw);
  for (const tier of tiers) {
    if (abs >= tier.min) {
      return `${prefix}${(krw / tier.divisor).toFixed(tier.dp)}${tier.suffix}`;
    }
  }
  return `${prefix}${fallback(krw)}`;
}

export function formatCurrencyFromKrw(
  amountKrw: number | null | undefined,
  currency: SupportedCurrency,
  locale = 'en-US',
  env: NodeJS.ProcessEnv = process.env
) {
  const value = convertFromKrw(amountKrw, currency, env);
  if (value === null || Number.isNaN(value)) return 'N/A';

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'JPY' || currency === 'KRW' ? 0 : 2
  }).format(value);
}

export function formatCurrencyFromKrwAtRate(
  amountKrw: number | null | undefined,
  currency: SupportedCurrency,
  rateToKrw?: number | null,
  locale = 'en-US',
  env: NodeJS.ProcessEnv = process.env
) {
  const value = convertFromKrwAtRate(amountKrw, currency, rateToKrw, env);
  if (value === null || Number.isNaN(value)) return 'N/A';

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'JPY' || currency === 'KRW' ? 0 : 2
  }).format(value);
}

/**
 * Compact, institutional money display: KRW renders in 조/억 (what a Korean
 * desk reads), every other currency uses Intl compact notation (e.g. $1.7B).
 * Use on dense financial panels where full 13-digit figures are unreadable —
 * `formatCurrencyFromKrwAtRate` stays for inputs/exports that need exact digits.
 */
export function formatCompactCurrencyFromKrwAtRate(
  amountKrw: number | null | undefined,
  currency: SupportedCurrency,
  rateToKrw?: number | null,
  locale = 'en-US',
  env: NodeJS.ProcessEnv = process.env
) {
  const value = convertFromKrwAtRate(amountKrw, currency, rateToKrw, env);
  if (value === null || Number.isNaN(value)) return 'N/A';
  const abs = Math.abs(value);

  if (currency === 'KRW') {
    if (abs >= 1e12) return `₩${(value / 1e12).toFixed(2)}조`;
    if (abs >= 1e8) return `₩${(value / 1e8).toFixed(1)}억`;
    if (abs >= 1e4) return `₩${Math.round(value / 1e4).toLocaleString('en-US')}만`;
    return `₩${Math.round(value).toLocaleString('en-US')}`;
  }

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 1
  }).format(value);
}
