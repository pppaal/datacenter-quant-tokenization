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
  return supportedCurrencies.includes(upper as SupportedCurrency) ? (upper as SupportedCurrency) : null;
}

export function resolveCurrencyFromCountry(country?: string | null): SupportedCurrency {
  const upper = country?.trim().toUpperCase();
  if (upper && countryCurrencyMap[upper]) return countryCurrencyMap[upper];
  return 'KRW';
}

export function resolveDisplayCurrency(countryOrMarket?: string | null) {
  return resolveCurrencyFromCountry(countryOrMarket);
}

export function resolveInputCurrency(country?: string | null, inputCurrency?: string | null): SupportedCurrency {
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
  const effectiveRate = rateToKrw && Number.isFinite(rateToKrw) && rateToKrw > 0 ? rateToKrw : getFxRateToKrw(currency, env);
  return amountKrw / effectiveRate;
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
