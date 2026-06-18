import { NextResponse } from 'next/server';
import { AdminAccessScopeType } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { assertActorScopeAccess } from '@/lib/security/admin-access';
import {
  getRequestIpAddress,
  resolveVerifiedAdminActorFromHeaders
} from '@/lib/security/admin-request';
import { recordAuditEvent } from '@/lib/services/audit';
import { genericErrorResponse } from '@/lib/security/error-response';
import { anchorLatestDocumentOnchain } from '@/lib/services/readiness';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await resolveVerifiedAdminActorFromHeaders(request.headers, prisma, {
    allowBasic: false,
    requireActiveSeat: true
  });
  const ipAddress = getRequestIpAddress(request.headers);

  if (!actor) {
    return NextResponse.json({ error: 'Active operator session required.' }, { status: 401 });
  }

  try {
    const { id } = await params;
    await assertActorScopeAccess(actor, AdminAccessScopeType.ASSET, id, prisma);
    await anchorLatestDocumentOnchain(id);
    await recordAuditEvent({
      actorIdentifier: actor.identifier,
      actorRole: actor.role,
      action: 'readiness.anchor',
      entityType: 'OnchainRecord',
      entityId: id,
      assetId: id,
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const { id } = await params;
    await recordAuditEvent({
      actorIdentifier: actor.identifier,
      actorRole: actor.role,
      action: 'readiness.anchor',
      entityType: 'OnchainRecord',
      entityId: id,
      assetId: id,
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress,
      statusLabel: 'FAILED',
      metadata: {
        error: error instanceof Error ? error.message : 'Failed to anchor review evidence onchain'
      }
    });
    // Generic client message + requestId; the real error (which can embed
    // onchain RPC / Prisma internals) is in the audit metadata above and is
    // reported server-side by genericErrorResponse.
    return genericErrorResponse(error, {
      status: 400,
      message: 'Failed to anchor review evidence onchain.',
      context: { route: '/api/readiness/assets/[id]/anchor', assetId: id }
    });
  }
}
