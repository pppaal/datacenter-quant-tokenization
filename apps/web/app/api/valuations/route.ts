import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { createValuationRun, listValuationRuns } from '@/lib/services/valuations';
import { getRequestIpAddress, resolveVerifiedAdminActorFromHeaders } from '@/lib/security/admin-request';
import { recordAuditEvent } from '@/lib/services/audit';

export async function GET() {
  const runs = await listValuationRuns();
  return NextResponse.json(runs);
}

export async function POST(request: Request) {
  const actor = await resolveVerifiedAdminActorFromHeaders(request.headers, prisma, {
    allowBasic: false,
    requireActiveSeat: true
  });
  if (!actor) {
    return NextResponse.json({ error: 'Active operator session required.' }, { status: 401 });
  }
  try {
    const payload = await request.json();
    const run = await createValuationRun(payload);
    await recordAuditEvent({
      actorIdentifier: actor?.identifier,
      actorRole: actor?.role,
      action: 'valuation.run.create',
      entityType: 'valuation_run',
      entityId: run.id,
      assetId: run.assetId,
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress: getRequestIpAddress(request.headers),
      metadata: {
        runLabel: run.runLabel,
        engineVersion: run.engineVersion,
        confidenceScore: run.confidenceScore
      }
    });
    return NextResponse.json(run, { status: 201 });
  } catch (error) {
    await recordAuditEvent({
      actorIdentifier: actor?.identifier,
      actorRole: actor?.role,
      action: 'valuation.run.create',
      entityType: 'valuation_run',
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress: getRequestIpAddress(request.headers),
      statusLabel: 'FAILED',
      metadata: {
        error: error instanceof Error ? error.message : 'Failed to create valuation run'
      }
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create valuation run' },
      { status: 400 }
    );
  }
}
