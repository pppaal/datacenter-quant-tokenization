import crypto from 'node:crypto';
import { z } from 'zod';
import type { KycEvent, KycProvider, KycProviderConfig } from './types';

/**
 * SumsubProvider — Sumsub webhook integration stub.
 *
 * Signature verification follows Sumsub's documented scheme:
 *   HMAC_SHA256(secret, <unix-ts-seconds> + <http-method> + <uri> + <raw-body>)
 *
 * This provider leaves the transport wiring (HTTPS + URL) to the caller. The
 * `parseEvent` path maps Sumsub's `applicantReviewed` payload into our
 * normalized `KycEvent`. The token wallet is expected to be stamped into
 * Sumsub's `externalUserId` by the onboarding frontend; country code comes
 * from the verified document (ISO 3166-1 alpha-3 → numeric mapping).
 *
 * NOTE: this is a scaffold — production should add:
 *   - retry-safe idempotency using `applicantId + reviewResult.reviewStatus`
 *   - country alpha3→numeric mapping (see ISO-3166 packages)
 *   - explicit reject reason persistence
 */
export class SumsubProvider implements KycProvider {
  public readonly name = 'sumsub';
  private readonly config: KycProviderConfig;

  constructor(config: KycProviderConfig) {
    this.config = config;
  }

  async verifySignature(rawBody: string, headers: Headers): Promise<void> {
    if (this.config.allowUnsignedLocal) return;
    const ts = headers.get('x-payload-digest-alg-ts') ?? headers.get('x-sumsub-ts');
    const got = headers.get('x-payload-digest') ?? headers.get('x-sumsub-signature');
    const method = headers.get('x-sumsub-method') ?? 'POST';
    const uri = headers.get('x-sumsub-uri') ?? '';
    if (!ts || !got) throw new Error('sumsub kyc: missing signature headers');

    const want = crypto
      .createHmac('sha256', this.config.webhookSecret)
      .update(`${ts}${method}${uri}${rawBody}`, 'utf-8')
      .digest('hex');

    if (got.length !== want.length) throw new Error('sumsub kyc: bad signature');
    let diff = 0;
    for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ want.charCodeAt(i);
    if (diff !== 0) throw new Error('sumsub kyc: bad signature');
  }

  async parseEvent(body: unknown): Promise<KycEvent> {
    const payload = SumsubPayloadSchema.parse(body);
    const wallet = payload.externalUserId;
    const countryCode = ALPHA3_TO_NUMERIC[payload.reviewResult.countryCodeAlpha3.toUpperCase()];
    if (!countryCode) {
      throw new Error(`sumsub kyc: unknown country code ${payload.reviewResult.countryCodeAlpha3}`);
    }
    const status = mapSumsubStatus(
      payload.reviewResult.reviewAnswer,
      payload.reviewResult.reviewRejectType
    );
    return {
      provider: this.name,
      providerApplicantId: payload.applicantId,
      wallet: wallet.toLowerCase(),
      countryCode,
      status,
      rawPayload: payload
    };
  }
}

const SumsubPayloadSchema = z.object({
  applicantId: z.string().min(1),
  externalUserId: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  reviewResult: z.object({
    reviewAnswer: z.enum(['GREEN', 'RED']),
    reviewRejectType: z.enum(['FINAL', 'RETRY']).optional(),
    countryCodeAlpha3: z.string().length(3)
  })
});

function mapSumsubStatus(
  answer: 'GREEN' | 'RED',
  rejectType: 'FINAL' | 'RETRY' | undefined
): KycEvent['status'] {
  if (answer === 'GREEN') return 'APPROVED';
  if (rejectType === 'FINAL') return 'REJECTED';
  return 'PENDING';
}

/**
 * Minimal alpha-3 → ISO 3166-1 numeric table for the jurisdictions we
 * currently support. Extend as needed — or swap for an `i18n-iso-countries`
 * dependency once we outgrow this.
 */
const ALPHA3_TO_NUMERIC: Record<string, number> = {
  KOR: 410,
  USA: 840,
  JPN: 392,
  SGP: 702,
  HKG: 344,
  GBR: 826,
  CHN: 156,
  DEU: 276,
  FRA: 250,
  // sanctioned samples
  PRK: 408,
  IRN: 364,
  CUB: 192,
  SYR: 760
};
