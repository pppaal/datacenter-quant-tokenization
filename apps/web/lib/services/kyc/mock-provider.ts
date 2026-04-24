import crypto from 'node:crypto';
import { z } from 'zod';
import type { KycEvent, KycProvider, KycProviderConfig } from './types';

/**
 * MockKycProvider — for local dev and CI. Signature scheme:
 *   sha256_hex( secret + rawBody )  ==  header `x-mock-kyc-signature`
 * so fixtures can be generated without real provider integrations.
 */
export class MockKycProvider implements KycProvider {
  public readonly name = 'mock';
  private readonly config: KycProviderConfig;

  constructor(config: KycProviderConfig) {
    this.config = config;
  }

  async verifySignature(rawBody: string, headers: Headers): Promise<void> {
    if (this.config.allowUnsignedLocal) return;
    const got = headers.get('x-mock-kyc-signature');
    if (!got) throw new Error('mock kyc: missing x-mock-kyc-signature');
    const want = crypto
      .createHash('sha256')
      .update(this.config.webhookSecret + rawBody, 'utf-8')
      .digest('hex');
    // constant-time-ish comparison
    if (got.length !== want.length) throw new Error('mock kyc: bad signature');
    let diff = 0;
    for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ want.charCodeAt(i);
    if (diff !== 0) throw new Error('mock kyc: bad signature');
  }

  async parseEvent(body: unknown): Promise<KycEvent> {
    const payload = MockPayloadSchema.parse(body);
    return {
      provider: this.name,
      providerApplicantId: payload.applicantId,
      wallet: payload.wallet.toLowerCase(),
      countryCode: payload.countryCode,
      status: payload.status,
      rawPayload: payload
    };
  }
}

const MockPayloadSchema = z.object({
  applicantId: z.string().min(1),
  wallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  countryCode: z.number().int().min(1).max(65535),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'REVOKED'])
});
