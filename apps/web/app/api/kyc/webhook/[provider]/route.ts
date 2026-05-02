import { NextResponse } from 'next/server';
import { recordAuditEvent } from '@/lib/services/audit';
import { getRequestIpAddress } from '@/lib/security/admin-request';
import { persistKycEvent } from '@/lib/services/kyc/bridge';
import { getKycProvider } from '@/lib/services/kyc/registry';

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
    await recordAuditEvent({
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

  try {
    const event = await provider.parseEvent(body);
    const record = await persistKycEvent(event);

    await recordAuditEvent({
      actorIdentifier: `kyc-webhook:${provider.name}`,
      actorRole: 'system',
      action: 'kyc.webhook_received',
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
        status: event.status
      }
    });

    return NextResponse.json({ kycRecordId: record.id, status: record.status });
  } catch (error) {
    await recordAuditEvent({
      actorIdentifier: `kyc-webhook:${provider.name}`,
      actorRole: 'system',
      action: 'kyc.webhook_failed',
      entityType: 'KycRecord',
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress,
      statusLabel: 'FAILED',
      metadata: { error: error instanceof Error ? error.message : 'parse/persist failed' }
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'invalid payload' },
      { status: 400 }
    );
  }
}
