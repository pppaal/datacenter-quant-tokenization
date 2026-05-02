import { NextResponse } from 'next/server';
import { CommitteeDecisionOutcome } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { hasRequiredAdminRole } from '@/lib/security/admin-auth';
import {
  getRequestIpAddress,
  resolveVerifiedAdminActorFromHeaders
} from '@/lib/security/admin-request';
import { recordAuditEvent } from '@/lib/services/audit';
import { decideCommitteePacket } from '@/lib/services/ic';
import { mutationRateLimiter, RateLimitError } from '@/lib/security/rate-limit';

const packetDecisionSchema = z.object({
  outcome: z.nativeEnum(CommitteeDecisionOutcome),
  notes: z.string().trim().max(4000).optional().nullable(),
  followUpActions: z.string().trim().max(4000).optional().nullable()
});

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

    const parsed = packetDecisionSchema.parse(await request.json());
    const packet = await decideCommitteePacket(id, parsed, actor.identifier, prisma);

    await recordAuditEvent({
      actorIdentifier: actor.identifier,
      actorRole: actor.role,
      action: 'ic.packet.decide',
      entityType: 'committee_packet',
      entityId: packet.id,
      assetId: packet.assetId,
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress: getRequestIpAddress(request.headers),
      metadata: {
        packetCode: packet.packetCode,
        status: packet.status,
        outcome: parsed.outcome
      }
    });

    return NextResponse.json({
      ok: true,
      packetId: packet.id,
      status: packet.status
    });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }

    await recordAuditEvent({
      actorIdentifier: actor.identifier,
      actorRole: actor.role,
      action: 'ic.packet.decide',
      entityType: 'committee_packet',
      entityId: id,
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress: getRequestIpAddress(request.headers),
      statusLabel: 'FAILED',
      metadata: {
        error: error instanceof Error ? error.message : 'Failed to record committee decision'
      }
    });

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to record committee decision' },
      { status: 400 }
    );
  }
}
