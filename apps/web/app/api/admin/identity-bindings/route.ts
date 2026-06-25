import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { recordAuditEvent } from '@/lib/services/audit';
import { withAdminApi } from '@/lib/security/with-admin-api';
import { updateAdminIdentityBindingUser } from '@/lib/security/admin-identity';

const IdentityBindingSchema = z.object({
  bindingId: z.string().trim().min(1),
  userId: z.string().trim().nullable().optional()
});

export const PATCH = withAdminApi({
  // ADMIN-only: remapping an SSO identity binding controls which user an SSO
  // subject resolves to. The wrapper returns 401 (no actor) vs 403
  // (insufficient role); this is defense-in-depth alongside the middleware
  // role gate (`getRequiredAdminRoleForPath` → ADMIN).
  requiredRole: 'ADMIN',
  bodySchema: IdentityBindingSchema,
  async handler({ actor, body, ipAddress, requestId }) {
    const bindingId = body.bindingId;
    const mappedUserId = body.userId?.trim() ? body.userId.trim() : null;

    try {
      const updatedBinding = await updateAdminIdentityBindingUser(
        {
          bindingId,
          userId: mappedUserId
        },
        prisma
      );

      await recordAuditEvent({
        actorIdentifier: actor.identifier,
        actorRole: actor.role,
        action: mappedUserId ? 'admin_identity_binding.map' : 'admin_identity_binding.clear',
        entityType: 'AdminIdentityBinding',
        entityId: bindingId,
        requestPath: '/api/admin/identity-bindings',
        requestMethod: 'PATCH',
        ipAddress,
        statusLabel: 'SUCCESS',
        metadata: {
          requestId,
          provider: updatedBinding?.provider ?? null,
          subject: updatedBinding?.subject ?? null,
          mappedUserId: updatedBinding?.userId ?? null
        }
      });

      return NextResponse.json({
        ok: true,
        binding: updatedBinding
      });
    } catch (error) {
      await recordAuditEvent({
        actorIdentifier: actor.identifier,
        actorRole: actor.role,
        action: 'admin_identity_binding.error',
        entityType: 'AdminIdentityBinding',
        entityId: bindingId,
        requestPath: '/api/admin/identity-bindings',
        requestMethod: 'PATCH',
        ipAddress,
        statusLabel: 'FAILED',
        metadata: {
          requestId,
          error: error instanceof Error ? error.message : 'Failed to update admin identity binding.'
        }
      });
      // Rethrow so `withAdminApi` genericizes the client response (generic
      // message + requestId) instead of leaking raw/Prisma internals.
      throw error;
    }
  }
});
