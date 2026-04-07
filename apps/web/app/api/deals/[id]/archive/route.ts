import { NextResponse } from 'next/server';
import { AdminAccessScopeType } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { assertActorScopeAccess } from '@/lib/security/admin-access';
import { getRequestIpAddress, resolveVerifiedAdminActorFromHeaders } from '@/lib/security/admin-request';
import { recordAuditEvent } from '@/lib/services/audit';
import { archiveDeal } from '@/lib/services/deals';

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
    await assertActorScopeAccess(actor, AdminAccessScopeType.DEAL, id, prisma);
    const payload = await request.json().catch(() => ({}));
    const deal = await archiveDeal(id, payload);
    if (!deal) {
      return NextResponse.json({ error: 'Deal not found.' }, { status: 404 });
    }
    await recordAuditEvent({
      actorIdentifier: actor.identifier,
      actorRole: actor.role,
      action: 'deal.archive',
      entityType: 'Deal',
      entityId: deal.id,
      assetId: deal.assetId ?? null,
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress
    });
    return NextResponse.json(deal);
  } catch (error) {
    const { id } = await params;
    await recordAuditEvent({
      actorIdentifier: actor.identifier,
      actorRole: actor.role,
      action: 'deal.archive',
      entityType: 'Deal',
      entityId: id,
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress,
      statusLabel: 'FAILED',
      metadata: {
        error: error instanceof Error ? error.message : 'Failed to archive deal'
      }
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to archive deal' },
      { status: 400 }
    );
  }
}
