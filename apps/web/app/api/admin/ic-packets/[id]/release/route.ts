import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { mutationRateLimiter, RateLimitError } from '@/lib/security/rate-limit';
import { withAdminApi } from '@/lib/security/with-admin-api';
import { releaseCommitteePacket } from '@/lib/services/ic';

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

    const packet = await releaseCommitteePacket(params.id, actor.identifier, prisma);
    return NextResponse.json({
      ok: true,
      packetId: packet.id,
      status: packet.status,
      releasedAt: packet.releasedAt
    });
  }
});
