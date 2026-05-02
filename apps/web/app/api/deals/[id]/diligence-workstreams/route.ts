import { NextResponse } from 'next/server';
import { AdminAccessScopeType } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { assertActorScopeAccess } from '@/lib/security/admin-access';
import {
  getRequestIpAddress,
  resolveVerifiedAdminActorFromHeaders
} from '@/lib/security/admin-request';
import { recordAuditEvent } from '@/lib/services/audit';
import { upsertDealDiligenceWorkstream } from '@/lib/services/deals';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let actor: Awaited<ReturnType<typeof resolveVerifiedAdminActorFromHeaders>> = null;
  let id = '';
  try {
    ({ id } = await params);
    actor = await resolveVerifiedAdminActorFromHeaders(request.headers, prisma, {
      allowBasic: false,
      requireActiveSeat: true
    });
    if (!actor) {
      return NextResponse.json({ error: 'Active operator session required.' }, { status: 401 });
    }
    await assertActorScopeAccess(actor, AdminAccessScopeType.DEAL, id, prisma);
    const payload = await request.json();
    const workstream = await upsertDealDiligenceWorkstream(id, payload);
    await recordAuditEvent({
      actorIdentifier: actor.identifier,
      actorRole: actor.role,
      action: 'deal.diligence_workstream.upsert',
      entityType: 'deal',
      entityId: id,
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress: getRequestIpAddress(request.headers),
      metadata: { workstreamType: payload.workstreamType }
    });
    return NextResponse.json(workstream, { status: 201 });
  } catch (error) {
    if (actor) {
      await recordAuditEvent({
        actorIdentifier: actor.identifier,
        actorRole: actor.role,
        action: 'deal.diligence_workstream.upsert',
        entityType: 'deal',
        entityId: id,
        requestPath: new URL(request.url).pathname,
        requestMethod: request.method,
        ipAddress: getRequestIpAddress(request.headers),
        statusLabel: 'FAILED',
        metadata: {
          error: error instanceof Error ? error.message : 'Failed to save diligence workstream'
        }
      });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save diligence workstream' },
      { status: 400 }
    );
  }
}
