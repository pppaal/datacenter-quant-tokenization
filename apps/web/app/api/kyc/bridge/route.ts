import { NextResponse } from 'next/server';
import { validationOrGenericError } from '@/lib/security/error-response';
import { genericErrorResponse } from '@/lib/security/error-response';
import { z } from 'zod';
import { AdminAccessScopeType } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { assertActorScopeAccess } from '@/lib/security/admin-access';
import {
  getRequestIpAddress,
  resolveVerifiedAdminActorFromHeaders
} from '@/lib/security/admin-request';
import { recordAuditEvent } from '@/lib/services/audit';
import { hasRequiredAdminRole } from '@/lib/security/admin-auth';
import { bridgeKycToChain } from '@/lib/services/kyc/bridge';

const BodySchema = z.object({
  kycRecordId: z.string().min(1),
  assetId: z.string().min(1)
});

export async function POST(request: Request) {
  const actor = await resolveVerifiedAdminActorFromHeaders(request.headers, prisma, {
    allowBasic: false,
    requireActiveSeat: true
  });
  const ipAddress = getRequestIpAddress(request.headers);
  if (!actor) {
    return NextResponse.json({ error: 'Active operator session required.' }, { status: 401 });
  }
  if (!hasRequiredAdminRole(actor.role, 'ADMIN')) {
    // Defense-in-depth alongside the middleware role gate
    // (`getRequiredAdminRoleForPath` → ADMIN). The KYC→chain bridge is an
    // irreversible on-chain action; never let it drop to "any active seat".
    return NextResponse.json(
      { error: 'Insufficient role. ADMIN access required.' },
      { status: 403 }
    );
  }

  let parsed;
  try {
    parsed = BodySchema.parse(await request.json());
  } catch (error) {
    return validationOrGenericError(error, { message: 'Invalid body.' });
  }

  try {
    await assertActorScopeAccess(
      actor,
      AdminAccessScopeType.ASSET,
      parsed.assetId,
      prisma,
      'mutation'
    );
    const result = await bridgeKycToChain({
      kycRecordId: parsed.kycRecordId,
      assetId: parsed.assetId
    });
    await recordAuditEvent({
      actorIdentifier: actor.identifier,
      actorRole: actor.role,
      action: 'kyc.bridge_to_chain',
      entityType: 'KycRecord',
      entityId: parsed.kycRecordId,
      assetId: parsed.assetId,
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress,
      metadata: { action: result.action, txHash: result.txHash }
    });
    return NextResponse.json(result);
  } catch (error) {
    await recordAuditEvent({
      actorIdentifier: actor.identifier,
      actorRole: actor.role,
      action: 'kyc.bridge_to_chain',
      entityType: 'KycRecord',
      entityId: parsed.kycRecordId,
      assetId: parsed.assetId,
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress,
      statusLabel: 'FAILED',
      metadata: { error: error instanceof Error ? error.message : 'bridge failed' }
    });
    return genericErrorResponse(error, {
      status: 400,
      message: 'Bridge failed',
      context: { route: 'kyc/bridge' }
    });
  }
}
