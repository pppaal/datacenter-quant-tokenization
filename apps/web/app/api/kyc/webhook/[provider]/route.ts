import { NextResponse } from 'next/server';
import { recordAuditEvent } from '@/lib/services/audit';
import { getRequestIpAddress } from '@/lib/security/admin-request';
import { persistKycEvent } from '@/lib/services/kyc/bridge';
import { getKycProvider } from '@/lib/services/kyc/registry';
import { createRateLimiter, RateLimitError } from '@/lib/security/rate-limit';
import { checkDistributedRateLimit } from '@/lib/security/distributed-rate-limit';
import { genericErrorResponse } from '@/lib/security/error-response';

// The webhook is public (authenticity comes from the provider signature, not a
// cookie), so an attacker who cannot forge a signature can still flood it to
// burn signature-verification CPU. Throttle per source-IP+provider BEFORE the
// signature check, in two layers: an always-on in-process limiter plus a
// cross-instance Upstash counter (soft-fails open when Redis is unconfigured,
// so dev/CI are unaffected). The limit is generous so legitimate provider
// bursts pass; it only caps abuse.
const WEBHOOK_RATE_WINDOW_MS = 60_000;
const WEBHOOK_RATE_MAX = 120;

const webhookRateLimiter = createRateLimiter('kyc-webhook', {
  windowMs: WEBHOOK_RATE_WINDOW_MS,
  maxRequests: WEBHOOK_RATE_MAX
});

/**
 * Best-effort failure-path audit. The error response must not depend on the
 * audit write succeeding: if audit itself throws (e.g. the same DB outage that
 * caused the persist failure), swallowing it here keeps us on the client-safe
 * branch instead of escaping the handler and surfacing an unhandled error
 * (which could leak a stack). Success-path audits stay strict (awaited) above.
 */
async function recordFailureAuditSafe(input: Parameters<typeof recordAuditEvent>[0]) {
  try {
    await recordAuditEvent(input);
  } catch {
    // Intentionally swallowed: audit is observability, not the control path.
  }
}

function tooManyRequests(retryAfterMs: number) {
  return NextResponse.json(
    { error: 'Too many requests. Please retry shortly.' },
    {
      status: 429,
      headers: { 'Retry-After': String(Math.max(1, Math.ceil(retryAfterMs / 1000))) }
    }
  );
}

/**
 * Provider-agnostic KYC webhook ingress. Verifies the signature using the
 * named provider's scheme, persists the normalized event as a `KycRecord`,
 * then returns `{ kycRecordId }` so downstream systems (or the admin UI) can
 * subsequently bridge the record to a specific on-chain deployment.
 *
 * No auth cookie is required — authenticity is established by the provider's
 * signing scheme. Each event is recorded in the audit trail whether or not
 * bridging succeeds.
 */
export async function POST(request: Request, context: { params: Promise<{ provider: string }> }) {
  const { provider: providerName } = await context.params;
  const ipAddress = getRequestIpAddress(request.headers);

  // Rate-limit before any signature work so unsigned floods are cheap to reject.
  const limiterKey = `${ipAddress ?? 'unknown'}:${providerName}`;
  try {
    webhookRateLimiter.check(limiterKey);
  } catch (error) {
    if (error instanceof RateLimitError) {
      return tooManyRequests(error.retryAfterMs);
    }
    throw error;
  }
  const distributed = await checkDistributedRateLimit(
    'kyc-webhook',
    limiterKey,
    WEBHOOK_RATE_WINDOW_MS,
    WEBHOOK_RATE_MAX
  );
  if (!distributed.allowed) {
    return tooManyRequests(distributed.retryAfterMs);
  }

  const rawBody = await request.text();

  let provider;
  try {
    provider = getKycProvider(providerName);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'unknown provider' },
      { status: 404 }
    );
  }

  try {
    await provider.verifySignature(rawBody, request.headers);
  } catch (error) {
    await recordFailureAuditSafe({
      actorIdentifier: `kyc-webhook:${provider.name}`,
      actorRole: 'system',
      action: 'kyc.webhook_signature_failed',
      entityType: 'KycRecord',
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress,
      statusLabel: 'FAILED',
      metadata: { error: error instanceof Error ? error.message : 'bad signature' }
    });
    return NextResponse.json({ error: 'signature verification failed' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'body is not valid JSON' }, { status: 400 });
  }

  // Parse is provider-facing: the payload comes from the provider, so its shape
  // errors (zod) and benign mapping errors (e.g. unknown country code) are safe
  // to echo back as a 400 so the provider can correct its payload (per the
  // documented decision to keep provider-facing parse-shape messages).
  let event;
  try {
    event = await provider.parseEvent(body);
  } catch (error) {
    await recordFailureAuditSafe({
      actorIdentifier: `kyc-webhook:${provider.name}`,
      actorRole: 'system',
      action: 'kyc.webhook_failed',
      entityType: 'KycRecord',
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress,
      statusLabel: 'FAILED',
      metadata: { error: error instanceof Error ? error.message : 'parse failed' }
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'invalid payload' },
      { status: 400 }
    );
  }

  // Persist touches our database: failures here (e.g. Prisma errors) can embed
  // internal table/column/connection detail, so they must NOT be echoed. Log
  // the real error server-side and return a generic message + requestId.
  try {
    const { record, idempotentNoop } = await persistKycEvent(event);

    await recordAuditEvent({
      actorIdentifier: `kyc-webhook:${provider.name}`,
      actorRole: 'system',
      action: idempotentNoop ? 'kyc.webhook_received_noop' : 'kyc.webhook_received',
      entityType: 'KycRecord',
      entityId: record.id,
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress,
      metadata: {
        provider: provider.name,
        providerApplicantId: event.providerApplicantId,
        wallet: event.wallet,
        countryCode: event.countryCode,
        status: event.status,
        idempotentNoop
      }
    });

    return NextResponse.json({ kycRecordId: record.id, status: record.status, idempotentNoop });
  } catch (error) {
    await recordFailureAuditSafe({
      actorIdentifier: `kyc-webhook:${provider.name}`,
      actorRole: 'system',
      action: 'kyc.webhook_failed',
      entityType: 'KycRecord',
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress,
      statusLabel: 'FAILED',
      metadata: { error: error instanceof Error ? error.message : 'persist failed' }
    });
    return genericErrorResponse(error, {
      status: 500,
      message: 'Failed to persist KYC event.',
      context: { route: 'kyc.webhook', provider: provider.name }
    });
  }
}
