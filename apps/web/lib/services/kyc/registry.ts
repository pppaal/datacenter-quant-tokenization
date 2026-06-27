import { env } from '@/lib/env';
import { isRealProduction } from '@/lib/runtime-env';
import { MockKycProvider } from './mock-provider';
import { SumsubProvider } from './sumsub-provider';
import type { KycProvider } from './types';

const cache = new Map<string, KycProvider>();

const DEFAULT_WEBHOOK_TS_SKEW_SECONDS = 300;

/**
 * Resolve the allowed webhook timestamp skew (seconds) from
 * `KYC_WEBHOOK_TS_SKEW_SECONDS`, falling back to a 5-minute default. A
 * malformed/non-positive value falls back to the default rather than silently
 * disabling the replay check.
 */
function resolveSkewSeconds(): number {
  const parsed = env().KYC_WEBHOOK_TS_SKEW_SECONDS;
  if (parsed === undefined) return DEFAULT_WEBHOOK_TS_SKEW_SECONDS;
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_WEBHOOK_TS_SKEW_SECONDS;
  return Math.floor(parsed);
}

export function getKycProvider(name: string): KycProvider {
  const key = name.toLowerCase();
  const cached = cache.get(key);
  if (cached) return cached;

  let provider: KycProvider;
  if (key === 'mock') {
    // The mock provider would accept forged KYC events; never allow it to handle
    // real-production webhooks, and require an explicit secret (no shared default).
    if (isRealProduction()) {
      throw new Error('The mock KYC provider must not be used in production.');
    }
    const webhookSecret = env().KYC_MOCK_WEBHOOK_SECRET?.trim();
    if (!webhookSecret) {
      throw new Error('KYC_MOCK_WEBHOOK_SECRET is required for the mock KYC provider.');
    }
    provider = new MockKycProvider({
      webhookSecret,
      allowUnsignedLocal: !isRealProduction() && env().KYC_MOCK_SKIP_SIG === '1'
    });
  } else if (key === 'sumsub') {
    const secret = env().KYC_SUMSUB_WEBHOOK_SECRET;
    if (!secret) {
      throw new Error('KYC_SUMSUB_WEBHOOK_SECRET is required for the Sumsub provider');
    }
    // Bound how old a signed webhook `ts` may be to defeat replay. Configurable
    // via KYC_WEBHOOK_TS_SKEW_SECONDS; defaults to 300s (5 min). In non-real-
    // production contexts (local/dev/e2e) the freshness check is skipped UNLESS
    // the env var is explicitly set, so fixtures with fixed timestamps don't
    // decay — mirroring the `allowUnsignedLocal` escape hatch the mock provider
    // uses.
    const enforceFreshness = isRealProduction() || env().KYC_WEBHOOK_TS_SKEW_SECONDS !== undefined;
    provider = new SumsubProvider({
      webhookSecret: secret,
      maxTimestampSkewSeconds: enforceFreshness ? resolveSkewSeconds() : undefined
    });
  } else {
    throw new Error(`Unknown KYC provider: ${name}`);
  }

  cache.set(key, provider);
  return provider;
}
