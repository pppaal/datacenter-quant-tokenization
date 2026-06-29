import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { mutationRateLimiter, RateLimitError } from '@/lib/security/rate-limit';
import { withAdminApi } from '@/lib/security/with-admin-api';
import {
  releaseCommitteePacket,
  SegregationOfDutiesError,
  CommitteePacketConflictError
} from '@/lib/services/ic';

export const POST = withAdminApi<undefined, { id: string }>({
  requiredRole: 'ADMIN',
  auditAction: 'ic.packet.release',
  auditEntityType: 'committee_packet',
  auditEntityIdFromParams: (params) => params.id,
  async handler({ actor, params, requestId }) {
    try {
      mutationRateLimiter.check(actor.identifier);
    } catch (error) {
      if (error instanceof RateLimitError) {
        return NextResponse.json(
          { error: error.message },
          { status: 429, headers: { 'X-Request-Id': requestId } }
        );
      }
      throw error;
    }

    let packet;
    try {
      packet = await releaseCommitteePacket(params.id, actor.identifier, prisma);
    } catch (error) {
      // Segregation-of-duties violations are an authorization failure for this
      // actor, not a server error — surface as 403 (insufficient permission).
      if (error instanceof SegregationOfDutiesError) {
        return NextResponse.json(
          { error: error.message },
          { status: 403, headers: { 'X-Request-Id': requestId } }
        );
      }
      if (error instanceof CommitteePacketConflictError) {
        return NextResponse.json(
          { error: error.message },
          { status: 409, headers: { 'X-Request-Id': requestId } }
        );
      }
      throw error;
    }

    return NextResponse.json({
      ok: true,
      packetId: packet.id,
      status: packet.status,
      releasedAt: packet.releasedAt
    });
  }
});
