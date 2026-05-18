import { NextResponse } from 'next/server';
import { AdminAccessScopeType } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { assertActorScopeAccess } from '@/lib/security/admin-access';
import {
  getRequestIpAddress,
  resolveVerifiedAdminActorFromHeaders
} from '@/lib/security/admin-request';
import { recordAuditEvent } from '@/lib/services/audit';
import { restoreDeal } from '@/lib/services/deals';

type Props = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: Request, { params }: Props) {
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
    const body = await request.json().catch(() => ({}));
    const deal = await restoreDeal(id, body);
    if (!deal) {
      return NextResponse.json({ error: 'Deal not found.' }, { status: 404 });
    }
    await recordAuditEvent({
      actorIdentifier: actor.identifier,
      actorRole: actor.role,
      action: 'deal.restore',
      entityType: 'Deal',
      entityId: deal.id,
      assetId: deal.assetId ?? null,
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress
    });
    return NextResponse.json({ deal });
  } catch (error) {
    const { id } = await params;
    await recordAuditEvent({
      actorIdentifier: actor.identifier,
      actorRole: actor.role,
      action: 'deal.restore',
      entityType: 'Deal',
      entityId: id,
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress,
      statusLabel: 'FAILED',
      metadata: {
        error: error instanceof Error ? error.message : 'Failed to restore deal'
      }
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to restore deal' },
      { status: 400 }
    );
  }
}
