import { NextResponse } from 'next/server';
import { logger, reportError } from '@/lib/observability/logger';
import { runAuditPrune } from '@/scripts/run-audit-log-pruner';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Cron-only entrypoint for the audit-log retention pruner. Authentication
 * is handled by the global middleware: `OPS_CRON_TOKEN` must match the
 * Authorization bearer header. The handler returns the same plan/result
 * payload the CLI variant emits so cron logs can be inspected directly.
 *
 * Wire this from `vercel.json`'s `crons` block; the default schedule is
 * daily at 03:30 UTC (12:30 KST).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const dryRun =
    url.searchParams.get('dry-run') === '1' || url.searchParams.get('dry-run') === 'true';
  try {
    const result = await runAuditPrune({ dryRun });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const requestId = crypto.randomUUID();
    await reportError(error, { route: '/api/ops/audit-prune', requestId });
    logger.error('audit_pruner_route_failed', {
      requestId,
      error: error instanceof Error ? error.message : String(error)
    });
    // Genericize: the real error is logged + reported above; the client only
    // sees a generic message + the correlating requestId.
    return NextResponse.json(
      { ok: false, error: 'Internal server error.', requestId },
      { status: 500, headers: { 'X-Request-Id': requestId } }
    );
  }
}

export async function POST(request: Request) {
  return GET(request);
}
