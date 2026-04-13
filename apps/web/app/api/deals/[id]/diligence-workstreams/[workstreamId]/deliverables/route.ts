import { NextResponse } from 'next/server';
import { AdminAccessScopeType } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { assertActorScopeAccess } from '@/lib/security/admin-access';
import { getRequestIpAddress, resolveVerifiedAdminActorFromHeaders } from '@/lib/security/admin-request';
import { recordAuditEvent } from '@/lib/services/audit';
import { attachDealDiligenceDeliverable } from '@/lib/services/deals';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; workstreamId: string }> }
) {
  let actor: Awaited<ReturnType<typeof resolveVerifiedAdminActorFromHeaders>> = null;
  let id = '';
  let workstreamId = '';
  try {
    ({ id, workstreamId } = await params);
    actor = await resolveVerifiedAdminActorFromHeaders(request.headers, prisma, {
      allowBasic: false,
      requireActiveSeat: true
    });
    if (!actor) {
      return NextResponse.json({ error: 'Active operator session required.' }, { status: 401 });
    }
    await assertActorScopeAccess(actor, AdminAccessScopeType.DEAL, id, prisma);
    const payload = await request.json();
    const deliverable = await attachDealDiligenceDeliverable(id, workstreamId, payload);
    await recordAuditEvent({
      actorIdentifier: actor.identifier,
      actorRole: actor.role,
      action: 'deal.diligence_deliverable.attach',
      entityType: 'deal',
      entityId: id,
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress: getRequestIpAddress(request.headers),
      metadata: { workstreamId, documentId: payload.documentId }
    });
    return NextResponse.json(deliverable, { status: 201 });
  } catch (error) {
    if (actor) {
      await recordAuditEvent({
        actorIdentifier: actor.identifier,
        actorRole: actor.role,
        action: 'deal.diligence_deliverable.attach',
        entityType: 'deal',
        entityId: id,
        requestPath: new URL(request.url).pathname,
        requestMethod: request.method,
        ipAddress: getRequestIpAddress(request.headers),
        statusLabel: 'FAILED',
        metadata: { workstreamId, error: error instanceof Error ? error.message : 'Failed to attach diligence deliverable' }
      });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to attach diligence deliverable' },
      { status: 400 }
    );
  }
}
