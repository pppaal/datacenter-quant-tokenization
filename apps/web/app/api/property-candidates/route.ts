import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import {
  getRequestIpAddress,
  resolveVerifiedAdminActorFromHeaders
} from '@/lib/security/admin-request';
import { recordAuditEvent } from '@/lib/services/audit';
import { buildPropertyExplorerData } from '@/lib/services/property-explorer';

export async function GET(request: Request) {
  const actor = await resolveVerifiedAdminActorFromHeaders(request.headers, prisma, {
    allowBasic: false,
    requireActiveSeat: true
  });
  const ipAddress = getRequestIpAddress(request.headers);

  if (!actor) {
    return NextResponse.json({ error: 'Active operator session required.' }, { status: 401 });
  }

  try {
    const explorerData = await buildPropertyExplorerData();

    await recordAuditEvent({
      actorIdentifier: actor.identifier,
      actorRole: actor.role,
      action: 'property_candidates.list',
      entityType: 'property_candidate',
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress,
      metadata: {}
    });

    return NextResponse.json(explorerData);
  } catch (error) {
    await recordAuditEvent({
      actorIdentifier: actor.identifier,
      actorRole: actor.role,
      action: 'property_candidates.list',
      entityType: 'property_candidate',
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress,
      statusLabel: 'FAILED',
      metadata: {
        error: error instanceof Error ? error.message : 'Failed to load property candidates'
      }
    });

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load property candidates' },
      { status: 400 }
    );
  }
}
