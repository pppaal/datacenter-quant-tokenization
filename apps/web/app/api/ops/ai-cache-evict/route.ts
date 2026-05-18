import { NextResponse } from 'next/server';
import { recordAuditEvent } from '@/lib/services/audit';
import { evictExpiredAiResponses } from '@/lib/services/ai/response-cache';

/**
 * Cron-triggered eviction of expired AiResponseCache rows.
 *
 * The cache is read-through and only refuses to serve expired rows;
 * without a periodic eviction, expired entries accumulate indefinitely.
 * For our scale (~hundreds of entries per model) this matters less for
 * disk than for the /admin/ops/ai-cache console — the dashboard's
 * "expired entries" count grows monotonically and stops being a useful
 * signal of how much eviction work is overdue.
 *
 * Cadence guidance: hourly. Cheap query (delete WHERE expiresAt <
 * NOW()), no outbound calls. Auth shares the OPS_CRON_TOKEN bearer
 * pattern with every other ops cron route.
 */

function isAuthorized(request: Request, expectedToken: string) {
  const bearer = request.headers
    .get('authorization')
    ?.replace(/^Bearer\s+/i, '')
    .trim();
  const headerToken = request.headers.get('x-ops-cron-token')?.trim();
  return bearer === expectedToken || headerToken === expectedToken;
}

export async function POST(request: Request) {
  const expectedToken = process.env.OPS_CRON_TOKEN?.trim();
  if (!expectedToken) {
    return NextResponse.json({ error: 'OPS_CRON_TOKEN is not configured' }, { status: 503 });
  }
  if (!isAuthorized(request, expectedToken)) {
    return NextResponse.json({ error: 'Unauthorized cron trigger' }, { status: 401 });
  }

  try {
    const { deleted } = await evictExpiredAiResponses();

    await recordAuditEvent({
      actorIdentifier: 'ops-cron',
      actorRole: 'SYSTEM',
      action: 'ai-cache.evict.scheduled',
      entityType: 'AiResponseCache',
      requestPath: '/api/ops/ai-cache-evict',
      requestMethod: 'POST',
      statusLabel: 'OK',
      metadata: { deleted }
    });

    return NextResponse.json({ ok: true, deleted });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to evict AI cache entries';
    await recordAuditEvent({
      actorIdentifier: 'ops-cron',
      actorRole: 'SYSTEM',
      action: 'ai-cache.evict.scheduled',
      entityType: 'AiResponseCache',
      requestPath: '/api/ops/ai-cache-evict',
      requestMethod: 'POST',
      statusLabel: 'FAILED',
      metadata: { error: message }
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
