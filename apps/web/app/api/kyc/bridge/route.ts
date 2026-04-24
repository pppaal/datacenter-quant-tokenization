import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AdminAccessScopeType } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { assertActorScopeAccess } from '@/lib/security/admin-access';
import {
  getRequestIpAddress,
  resolveVerifiedAdminActorFromHeaders
} from '@/lib/security/admin-request';
import { recordAuditEvent } from '@/lib/services/audit';
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

  let parsed;
  try {
    parsed = BodySchema.parse(await request.json());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Invalid body' },
      { status: 400 }
    );
  }

  try {
    await assertActorScopeAccess(actor, AdminAccessScopeType.ASSET, parsed.assetId, prisma);
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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'bridge failed' },
      { status: 400 }
    );
  }
}
