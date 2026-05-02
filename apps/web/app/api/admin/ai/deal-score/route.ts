import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import {
  getRequestIpAddress,
  resolveVerifiedAdminActorFromHeaders
} from '@/lib/security/admin-request';
import { recordAuditEvent } from '@/lib/services/audit';
import { hasRequiredAdminRole } from '@/lib/security/admin-auth';
import { OpenAIConfigurationError, scoreDeal } from '@/lib/services/ai-assistant';

export async function POST(request: Request) {
  const actor = await resolveVerifiedAdminActorFromHeaders(request.headers, prisma, {
    allowBasic: false,
    requireActiveSeat: true
  });
  const ipAddress = getRequestIpAddress(request.headers);

  if (!actor || !hasRequiredAdminRole(actor.role, 'ANALYST')) {
    return NextResponse.json({ error: 'Admin analyst session required.' }, { status: 401 });
  }

  let dealId: string | null = null;

  try {
    const body = (await request.json().catch(() => null)) as { dealId?: unknown } | null;
    if (!body || typeof body.dealId !== 'string' || body.dealId.trim().length === 0) {
      return NextResponse.json({ error: 'dealId is required.' }, { status: 400 });
    }
    dealId = body.dealId.trim();

    const result = await scoreDeal(dealId, prisma);

    await recordAuditEvent({
      actorIdentifier: actor.identifier,
      actorRole: actor.role,
      action: 'ai.deal.score',
      entityType: 'Deal',
      entityId: dealId,
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress,
      metadata: {
        score: result.score,
        redFlagCount: result.redFlags.length,
        greenFlagCount: result.greenFlags.length
      }
    });

    return NextResponse.json(result);
  } catch (error) {
    const isConfigError = error instanceof OpenAIConfigurationError;
    const status = isConfigError ? 503 : 400;

    await recordAuditEvent({
      actorIdentifier: actor.identifier,
      actorRole: actor.role,
      action: 'ai.deal.score',
      entityType: 'Deal',
      entityId: dealId,
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress,
      statusLabel: 'FAILED',
      metadata: {
        error: error instanceof Error ? error.message : 'Failed to score deal'
      }
    });

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to score deal' },
      { status }
    );
  }
}
