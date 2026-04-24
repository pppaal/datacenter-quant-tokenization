import { MockKycProvider } from './mock-provider';
import { SumsubProvider } from './sumsub-provider';
import type { KycProvider } from './types';

const cache = new Map<string, KycProvider>();

export function getKycProvider(name: string): KycProvider {
  const key = name.toLowerCase();
  const cached = cache.get(key);
  if (cached) return cached;

  let provider: KycProvider;
  if (key === 'mock') {
    provider = new MockKycProvider({
      webhookSecret: process.env.KYC_MOCK_WEBHOOK_SECRET ?? 'dev-mock-secret',
      allowUnsignedLocal:
        process.env.NODE_ENV !== 'production' && process.env.KYC_MOCK_SKIP_SIG === '1'
    });
  } else if (key === 'sumsub') {
    const secret = process.env.KYC_SUMSUB_WEBHOOK_SECRET;
    if (!secret) {
      throw new Error('KYC_SUMSUB_WEBHOOK_SECRET is required for the Sumsub provider');
    }
    provider = new SumsubProvider({ webhookSecret: secret });
  } else {
    throw new Error(`Unknown KYC provider: ${name}`);
  }

  cache.set(key, provider);
  return provider;
}
