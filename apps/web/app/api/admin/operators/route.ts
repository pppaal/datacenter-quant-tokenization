import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import {
  rotateAdminOperatorSessionVersion,
  updateAdminOperatorSeat
} from '@/lib/security/admin-identity';
import { revokePersistedAdminSessionsForUser } from '@/lib/security/admin-session';
import {
  hashOperatorPassword,
  OPERATOR_PASSWORD_MIN_LENGTH
} from '@/lib/security/operator-credentials';
import { recordAuditEvent } from '@/lib/services/audit';
import { withAdminApi } from '@/lib/security/with-admin-api';

const OperatorSchema = z.object({
  userId: z.string().trim().min(1),
  role: z.enum(['VIEWER', 'ANALYST', 'ADMIN']).optional(),
  isActive: z.boolean().optional(),
  rotateSessionVersion: z.boolean().optional(),
  newPassword: z.string().min(OPERATOR_PASSWORD_MIN_LENGTH).max(256).optional()
});

const OperatorCreateSchema = z.object({
  name: z.string().trim().min(1).max(160),
  email: z.string().trim().toLowerCase().email().max(320),
  role: z.enum(['VIEWER', 'ANALYST', 'ADMIN']),
  password: z.string().min(OPERATOR_PASSWORD_MIN_LENGTH).max(256)
});

export const POST = withAdminApi({
  // ADMIN-only: provisioning an operator seat WITH a login credential is
  // privilege administration. This is the in-app alternative to editing
  // ADMIN_BASIC_AUTH_* env vars + redeploying: the created seat signs in at
  // /admin/login with its email and the initial password set here.
  requiredRole: 'ADMIN',
  bodySchema: OperatorCreateSchema,
  async handler({ actor, body, ipAddress, requestId }) {
    try {
      const existing = await prisma.user.findUnique({
        where: { email: body.email },
        select: { id: true }
      });
      if (existing) {
        return NextResponse.json(
          { error: 'An operator with this email already exists.' },
          { status: 409 }
        );
      }

      const passwordHash = await hashOperatorPassword(body.password);
      const created = await prisma.user.create({
        data: {
          name: body.name,
          email: body.email,
          role: body.role,
          isActive: true,
          passwordHash
        },
        select: { id: true, name: true, email: true, role: true, isActive: true }
      });

      await recordAuditEvent({
        actorIdentifier: actor.identifier,
        actorRole: actor.role,
        action: 'admin_operator.create',
        entityType: 'User',
        entityId: created.id,
        requestPath: '/api/admin/operators',
        requestMethod: 'POST',
        ipAddress,
        statusLabel: 'SUCCESS',
        metadata: {
          requestId,
          role: created.role,
          hasPasswordCredential: true
        }
      });

      return NextResponse.json({ ok: true, user: created }, { status: 201 });
    } catch (error) {
      await recordAuditEvent({
        actorIdentifier: actor.identifier,
        actorRole: actor.role,
        action: 'admin_operator.error',
        entityType: 'User',
        entityId: null,
        requestPath: '/api/admin/operators',
        requestMethod: 'POST',
        ipAddress,
        statusLabel: 'FAILED',
        metadata: {
          requestId,
          error: error instanceof Error ? error.message : 'Failed to create operator seat.'
        }
      });
      // Rethrow so `withAdminApi` genericizes the client response.
      throw error;
    }
  }
});

export const PATCH = withAdminApi({
  // ADMIN-only: mutating an operator seat (role / active state), rotating its
  // session version, or resetting its password credential is
  // privilege-administration. The wrapper returns 401 (no
  // actor) vs 403 (insufficient role); defense-in-depth alongside the
  // middleware role gate (`getRequiredAdminRoleForPath` → ADMIN).
  requiredRole: 'ADMIN',
  bodySchema: OperatorSchema,
  async handler({ actor, body, ipAddress, requestId }) {
    const userId = body.userId;

    try {
      let updatedUser;
      if (body.rotateSessionVersion) {
        updatedUser = await rotateAdminOperatorSessionVersion({ userId }, prisma);
      } else if (body.newPassword && !body.role && typeof body.isActive !== 'boolean') {
        // Password-only reset: swap the credential and bump the session
        // version so every session minted against the old password dies.
        const passwordHash = await hashOperatorPassword(body.newPassword);
        updatedUser = await prisma.user.update({
          where: { id: userId },
          data: { passwordHash, sessionVersion: { increment: 1 } },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            isActive: true,
            sessionVersion: true
          }
        });
      } else {
        if (body.newPassword) {
          await prisma.user.update({
            where: { id: userId },
            data: { passwordHash: await hashOperatorPassword(body.newPassword) },
            select: { id: true }
          });
        }
        updatedUser = await updateAdminOperatorSeat(
          {
            userId,
            role: body.role,
            isActive: typeof body.isActive === 'boolean' ? body.isActive : undefined,
            actingUserId: actor.userId ?? null
          },
          prisma
        );
      }

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
          passwordReset: Boolean(body.newPassword),
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
