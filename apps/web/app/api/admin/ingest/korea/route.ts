import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { hasRequiredAdminRole } from '@/lib/security/admin-auth';
import { getRequestIpAddress, resolveVerifiedAdminActorFromHeaders } from '@/lib/security/admin-request';
import { mutationRateLimiter, RateLimitError } from '@/lib/security/rate-limit';
import { recordAuditEvent } from '@/lib/services/audit';
import { runKoreaIngest } from '@/lib/services/data-ingest';

export async function POST(request: Request) {
  const actor = await resolveVerifiedAdminActorFromHeaders(request.headers, prisma, {
    allowBasic: false,
    requireActiveSeat: true
  });

  if (!actor || !hasRequiredAdminRole(actor.role, 'ADMIN')) {
    return NextResponse.json({ error: 'Admin session required.' }, { status: 401 });
  }

  try {
    mutationRateLimiter.check(actor.identifier);

    const result = await runKoreaIngest(prisma);

    const totalRows = result.sourceResults.reduce((sum, entry) => sum + entry.rowCount, 0);
    const failedSources = result.sourceResults.filter((entry) => entry.status === 'FAILED').length;
    const partialSources = result.sourceResults.filter((entry) => entry.status === 'PARTIAL').length;
    const runStatusLabel = failedSources > 0 ? 'PARTIAL' : 'SUCCESS';

    await recordAuditEvent({
      actorIdentifier: actor.identifier,
      actorRole: actor.role,
      action: 'ingest.korea.run',
      entityType: 'ingest_run',
      entityId: result.runId,
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress: getRequestIpAddress(request.headers),
      statusLabel: runStatusLabel,
      metadata: {
        runId: result.runId,
        startedAt: result.startedAt.toISOString(),
        finishedAt: result.finishedAt.toISOString(),
        totalRows,
        failedSources,
        partialSources,
        sourceResults: result.sourceResults.map((entry) => ({
          source: entry.source,
          rowCount: entry.rowCount,
          status: entry.status,
          error: entry.error ?? null
        }))
      }
    });

    return NextResponse.json({
      ok: true,
      runId: result.runId,
      startedAt: result.startedAt.toISOString(),
      finishedAt: result.finishedAt.toISOString(),
      sourceResults: result.sourceResults
    });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }

    await recordAuditEvent({
      actorIdentifier: actor.identifier,
      actorRole: actor.role,
      action: 'ingest.korea.run',
      entityType: 'ingest_run',
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress: getRequestIpAddress(request.headers),
      statusLabel: 'FAILED',
      metadata: {
        error: error instanceof Error ? error.message : 'Korea ingest run failed.'
      }
    });

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Korea ingest run failed.' },
      { status: 500 }
    );
  }
}
