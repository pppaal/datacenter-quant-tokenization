import { NextResponse } from 'next/server';
import { validationOrGenericError } from '@/lib/security/error-response';
import { CommitteeDecisionOutcome } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { hasRequiredAdminRole } from '@/lib/security/admin-auth';
import {
  getRequestIpAddress,
  resolveVerifiedAdminActorFromHeaders
} from '@/lib/security/admin-request';
import { recordAuditEvent } from '@/lib/services/audit';
import { decideCommitteePacket, SegregationOfDutiesError } from '@/lib/services/ic';
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

  if (!actor) {
    // 401: no authenticated operator session.
    return NextResponse.json({ error: 'Admin session required.' }, { status: 401 });
  }
  if (!hasRequiredAdminRole(actor.role, 'ADMIN')) {
    // 403: authenticated but lacks the ADMIN role required to decide packets.
    return NextResponse.json(
      { error: 'Insufficient role. ADMIN access required.' },
      { status: 403 }
    );
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

    // Segregation-of-duties violations are an authorization failure for this
    // actor, not a validation error — surface as 403 (insufficient permission).
    if (error instanceof SegregationOfDutiesError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    return validationOrGenericError(error, { message: 'Failed to record committee decision.' });
  }
}
