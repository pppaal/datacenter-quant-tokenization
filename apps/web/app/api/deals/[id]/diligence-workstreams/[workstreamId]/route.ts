import { NextResponse } from 'next/server';
import { AdminAccessScopeType } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { assertActorScopeAccess } from '@/lib/security/admin-access';
import { getRequestIpAddress, resolveVerifiedAdminActorFromHeaders } from '@/lib/security/admin-request';
import { recordAuditEvent } from '@/lib/services/audit';
import { updateDealDiligenceWorkstream } from '@/lib/services/deals';

export async function PATCH(
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
    const workstream = await updateDealDiligenceWorkstream(id, workstreamId, payload);
    await recordAuditEvent({
      actorIdentifier: actor.identifier,
      actorRole: actor.role,
      action: 'deal.diligence_workstream.update',
      entityType: 'deal',
      entityId: id,
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress: getRequestIpAddress(request.headers),
      metadata: { workstreamId }
    });
    return NextResponse.json(workstream);
  } catch (error) {
    if (actor) {
      await recordAuditEvent({
        actorIdentifier: actor.identifier,
        actorRole: actor.role,
        action: 'deal.diligence_workstream.update',
        entityType: 'deal',
        entityId: id,
        requestPath: new URL(request.url).pathname,
        requestMethod: request.method,
        ipAddress: getRequestIpAddress(request.headers),
        statusLabel: 'FAILED',
        metadata: { workstreamId, error: error instanceof Error ? error.message : 'Failed to update diligence workstream' }
      });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update diligence workstream' },
      { status: 400 }
    );
  }
}
