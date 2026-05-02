import { NextResponse } from 'next/server';
import { recordAuditEvent } from '@/lib/services/audit';
import { runOpsCycle } from '@/lib/services/ops-worker';

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
    const summary = await runOpsCycle({
      actorIdentifier: 'ops-cron',
      scheduled: true
    });

    await recordAuditEvent({
      actorIdentifier: 'ops-cron',
      actorRole: 'SYSTEM',
      action: 'ops.cycle.scheduled',
      entityType: 'OpsCycle',
      requestPath: '/api/ops/cycle',
      requestMethod: 'POST',
      statusLabel: 'SUCCESS',
      metadata: {
        sourceRunId: summary.sourceRun.id,
        researchRunId: summary.researchRun.id,
        sourceStatus: summary.sourceRun.statusLabel,
        researchStatus: summary.researchRun.statusLabel
      }
    });

    return NextResponse.json(summary);
  } catch (error) {
    await recordAuditEvent({
      actorIdentifier: 'ops-cron',
      actorRole: 'SYSTEM',
      action: 'ops.cycle.scheduled',
      entityType: 'OpsCycle',
      requestPath: '/api/ops/cycle',
      requestMethod: 'POST',
      statusLabel: 'FAILED',
      metadata: {
        error: error instanceof Error ? error.message : 'Failed to run ops cycle'
      }
    });

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to run ops cycle' },
      { status: 500 }
    );
  }
}
