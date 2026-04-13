import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getRequestIpAddress, resolveVerifiedAdminActorFromHeaders } from '@/lib/security/admin-request';
import { recordAuditEvent } from '@/lib/services/audit';
import { hasRequiredAdminRole } from '@/lib/security/admin-auth';
import { getCommitteeWorkspace } from '@/lib/services/ic';

export async function GET(request: Request) {
  const actor = await resolveVerifiedAdminActorFromHeaders(request.headers, prisma, {
    allowBasic: false,
    requireActiveSeat: true
  });
  const ipAddress = getRequestIpAddress(request.headers);

  if (!actor || !hasRequiredAdminRole(actor.role, 'ADMIN')) {
    return NextResponse.json({ error: 'Admin session required.' }, { status: 401 });
  }

  try {
    const workspace = await getCommitteeWorkspace();

    await recordAuditEvent({
      actorIdentifier: actor.identifier,
      actorRole: actor.role,
      action: 'ic.workspace.list',
      entityType: 'committee_workspace',
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress,
      metadata: {}
    });

    return NextResponse.json(workspace);
  } catch (error) {
    await recordAuditEvent({
      actorIdentifier: actor.identifier,
      actorRole: actor.role,
      action: 'ic.workspace.list',
      entityType: 'committee_workspace',
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress,
      statusLabel: 'FAILED',
      metadata: {
        error: error instanceof Error ? error.message : 'Failed to load committee workspace'
      }
    });

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load committee workspace' },
      { status: 400 }
    );
  }
}
