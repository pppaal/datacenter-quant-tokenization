import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import {
  getRequestIpAddress,
  resolveVerifiedAdminActorFromHeaders
} from '@/lib/security/admin-request';
import { recordAuditEvent } from '@/lib/services/audit';
import { hasRequiredAdminRole } from '@/lib/security/admin-auth';
import { OpenAIConfigurationError, summarizeResearchSnapshot } from '@/lib/services/ai-assistant';

export async function POST(request: Request) {
  const actor = await resolveVerifiedAdminActorFromHeaders(request.headers, prisma, {
    allowBasic: false,
    requireActiveSeat: true
  });
  const ipAddress = getRequestIpAddress(request.headers);

  if (!actor || !hasRequiredAdminRole(actor.role, 'ANALYST')) {
    return NextResponse.json({ error: 'Admin analyst session required.' }, { status: 401 });
  }

  let snapshotId: string | null = null;

  try {
    const body = (await request.json().catch(() => null)) as { snapshotId?: unknown } | null;
    if (!body || typeof body.snapshotId !== 'string' || body.snapshotId.trim().length === 0) {
      return NextResponse.json({ error: 'snapshotId is required.' }, { status: 400 });
    }
    snapshotId = body.snapshotId.trim();

    const result = await summarizeResearchSnapshot(snapshotId, prisma);

    await recordAuditEvent({
      actorIdentifier: actor.identifier,
      actorRole: actor.role,
      action: 'ai.research.summarize',
      entityType: 'ResearchSnapshot',
      entityId: snapshotId,
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress,
      metadata: {
        cached: result.cached,
        bulletCount: result.bullets.length
      }
    });

    return NextResponse.json(result);
  } catch (error) {
    const isConfigError = error instanceof OpenAIConfigurationError;
    const status = isConfigError ? 503 : 400;

    await recordAuditEvent({
      actorIdentifier: actor.identifier,
      actorRole: actor.role,
      action: 'ai.research.summarize',
      entityType: 'ResearchSnapshot',
      entityId: snapshotId,
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress,
      statusLabel: 'FAILED',
      metadata: {
        error: error instanceof Error ? error.message : 'Failed to summarize research snapshot'
      }
    });

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to summarize research snapshot'
      },
      { status }
    );
  }
}
