import { NextResponse } from 'next/server';
import { validationOrGenericError } from '@/lib/security/error-response';
import { prisma } from '@/lib/db/prisma';
import { recordAuditEvent } from '@/lib/services/audit';
import { lockCommitteePacket, CommitteePacketConflictError } from '@/lib/services/ic';
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

  if (!actor) {
    // 401: no authenticated operator session.
    return NextResponse.json({ error: 'Admin session required.' }, { status: 401 });
  }
  if (!hasRequiredAdminRole(actor.role, 'ADMIN')) {
    // 403: authenticated but lacks the ADMIN role required to lock packets.
    return NextResponse.json(
      { error: 'Insufficient role. ADMIN access required.' },
      { status: 403 }
    );
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
    if (error instanceof CommitteePacketConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
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

    return validationOrGenericError(error, { message: 'Failed to lock committee packet.' });
  }
}
