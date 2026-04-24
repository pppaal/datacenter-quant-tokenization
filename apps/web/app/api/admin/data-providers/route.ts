/**
 * GET /api/admin/data-providers
 *
 * Returns the current mode (live vs mock) for each public-data connector so
 * operators can verify which upstreams are wired in the running environment.
 * Source of truth is `resolveConnectorMode()` in public-data/registry — this
 * endpoint is a thin read-only view over that function.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getRequestIpAddress, resolveVerifiedAdminActorFromHeaders } from '@/lib/security/admin-request';
import { recordAuditEvent } from '@/lib/services/audit';
import { resolveConnectorMode } from '@/lib/services/public-data/registry';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const actor = await resolveVerifiedAdminActorFromHeaders(request.headers, prisma, {
    allowBasic: false,
    requireActiveSeat: true
  });
  const ipAddress = getRequestIpAddress(request.headers);

  if (!actor) {
    return NextResponse.json({ error: 'Active admin session required.' }, { status: 401 });
  }

  const modes = resolveConnectorMode();

  await recordAuditEvent({
    actorIdentifier: actor?.identifier ?? null,
    actorRole: actor?.role ?? null,
    action: 'admin_data_providers.read',
    entityType: 'PublicDataRegistry',
    entityId: null,
    requestPath: '/api/admin/data-providers',
    requestMethod: 'GET',
    ipAddress,
    statusLabel: 'SUCCESS',
    metadata: { modes }
  });

  return NextResponse.json({ providers: modes });
}
