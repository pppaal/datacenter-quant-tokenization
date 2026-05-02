import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { recordAuditEvent } from '@/lib/services/audit';
import { lockCommitteePacket } from '@/lib/services/ic';
import {
  getRequestIpAddress,
  resolveVerifiedAdminActorFromHeaders
} from '@/lib/security/admin-request';
import { hasRequiredAdminRole } from '@/lib/security/admin-auth';
import { mutationRateLimiter, RateLimitError } from '@/lib/security/rate-limit';

export async function POST(
  request: Request,
  context: {
    params: Promise<{
      id: string;
    }>;
  }
) {
  const actor = await resolveVerifiedAdminActorFromHeaders(request.headers, prisma, {
    allowBasic: false,
    requireActiveSeat: true
  });

  if (!actor || !hasRequiredAdminRole(actor.role, 'ADMIN')) {
    return NextResponse.json({ error: 'Admin session required.' }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    mutationRateLimiter.check(actor.identifier);

    const packet = await lockCommitteePacket(id, actor.identifier, prisma);

    await recordAuditEvent({
      actorIdentifier: actor.identifier,
      actorRole: actor.role,
      action: 'ic.packet.lock',
      entityType: 'committee_packet',
      entityId: packet.id,
      assetId: packet.assetId,
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress: getRequestIpAddress(request.headers),
      metadata: {
        packetCode: packet.packetCode,
        status: packet.status,
        lockedAt: packet.lockedAt?.toISOString() ?? null
      }
    });

    return NextResponse.json({
      ok: true,
      packetId: packet.id,
      status: packet.status,
      lockedAt: packet.lockedAt
    });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }

    await recordAuditEvent({
      actorIdentifier: actor.identifier,
      actorRole: actor.role,
      action: 'ic.packet.lock',
      entityType: 'committee_packet',
      entityId: id,
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress: getRequestIpAddress(request.headers),
      statusLabel: 'FAILED',
      metadata: {
        error: error instanceof Error ? error.message : 'Failed to lock committee packet'
      }
    });

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to lock committee packet' },
      { status: 400 }
    );
  }
}
