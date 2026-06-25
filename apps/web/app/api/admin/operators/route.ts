import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import {
  rotateAdminOperatorSessionVersion,
  updateAdminOperatorSeat
} from '@/lib/security/admin-identity';
import { revokePersistedAdminSessionsForUser } from '@/lib/security/admin-session';
import { recordAuditEvent } from '@/lib/services/audit';
import { withAdminApi } from '@/lib/security/with-admin-api';

const OperatorSchema = z.object({
  userId: z.string().trim().min(1),
  role: z.enum(['VIEWER', 'ANALYST', 'ADMIN']).optional(),
  isActive: z.boolean().optional(),
  rotateSessionVersion: z.boolean().optional()
});

export const PATCH = withAdminApi({
  // ADMIN-only: mutating an operator seat (role / active state) or rotating its
  // session version is privilege-administration. The wrapper returns 401 (no
  // actor) vs 403 (insufficient role); defense-in-depth alongside the
  // middleware role gate (`getRequiredAdminRoleForPath` → ADMIN).
  requiredRole: 'ADMIN',
  bodySchema: OperatorSchema,
  async handler({ actor, body, ipAddress, requestId }) {
    const userId = body.userId;

    try {
      const updatedUser = body.rotateSessionVersion
        ? await rotateAdminOperatorSessionVersion({ userId }, prisma)
        : await updateAdminOperatorSeat(
            {
              userId,
              role: body.role,
              isActive: typeof body.isActive === 'boolean' ? body.isActive : undefined,
              actingUserId: actor.userId ?? null
            },
            prisma
          );

      const revokedSessions = await revokePersistedAdminSessionsForUser(updatedUser.id, prisma);

      await recordAuditEvent({
        actorIdentifier: actor.identifier,
        actorRole: actor.role,
        action: 'admin_operator.update',
        entityType: 'User',
        entityId: updatedUser.id,
        requestPath: '/api/admin/operators',
        requestMethod: 'PATCH',
        ipAddress,
        statusLabel: 'SUCCESS',
        metadata: {
          requestId,
          nextRole: updatedUser.role,
          isActive: updatedUser.isActive,
          sessionVersion: updatedUser.sessionVersion ?? null,
          rotatedSessions: Boolean(body.rotateSessionVersion),
          revokedSessionCount: revokedSessions.count
        }
      });

      return NextResponse.json({
        ok: true,
        user: updatedUser,
        revokedSessionCount: revokedSessions.count
      });
    } catch (error) {
      await recordAuditEvent({
        actorIdentifier: actor.identifier,
        actorRole: actor.role,
        action: 'admin_operator.error',
        entityType: 'User',
        entityId: userId,
        requestPath: '/api/admin/operators',
        requestMethod: 'PATCH',
        ipAddress,
        statusLabel: 'FAILED',
        metadata: {
          requestId,
          error: error instanceof Error ? error.message : 'Failed to update operator seat.'
        }
      });
      // Rethrow so `withAdminApi` genericizes the client response (generic
      // message + requestId) instead of leaking raw/Prisma internals.
      throw error;
    }
  }
});
