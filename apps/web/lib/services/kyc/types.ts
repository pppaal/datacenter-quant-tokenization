/**
 * Normalized KYC event shape consumed by the bridge → on-chain writer.
 * Provider-specific webhooks map into this shape before hitting persistence.
 */
export type KycEventStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVOKED';

export type KycEvent = {
  provider: string;
  providerApplicantId: string;
  wallet: string; // 0x-prefixed, normalized lower-case
  countryCode: number; // ISO 3166-1 numeric
  status: KycEventStatus;
  rawPayload: unknown;
};

export type KycProviderConfig = {
  /** Provider-side signing secret; used to verify inbound webhooks. */
  webhookSecret: string;
  /** When true, signature verification is skipped (local + test). */
  allowUnsignedLocal?: boolean;
};

export interface KycProvider {
  /** Stable provider identifier persisted on `KycRecord.provider`. */
  readonly name: string;

  /**
   * Validate a webhook signature against the raw request body. Throws on
   * failure. Implementations should be constant-time where possible.
   */
  verifySignature(rawBody: string, headers: Headers): Promise<void>;

  /**
   * Parse a verified webhook payload into the normalized event shape.
   * Throws on malformed payloads.
   */
  parseEvent(body: unknown): Promise<KycEvent>;
}
