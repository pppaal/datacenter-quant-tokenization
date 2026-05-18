import { NextResponse } from 'next/server';
import { NotificationSeverity, NotificationType } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { recordAuditEvent } from '@/lib/services/audit';
import { createNotification } from '@/lib/services/notifications';

/**
 * Stale-DRAFT alert cron.
 *
 * The quarterly publication's review gate enforces approvalStatus =
 * APPROVED before a HOUSE-view ResearchSnapshot ships to the PDF.
 * Drafts that age out without being either approved, superseded, or
 * explicitly rejected are inertia — operator hasn't returned to the
 * workspace and the bottleneck is invisible. This cron scans for
 * DRAFTs older than the threshold and emits a SYSTEM notification per
 * stale row so the analyst nav badge surfaces the work.
 *
 * Trigger: POST /api/ops/research-stale-drafts
 *   ?days=N — override default threshold (7 days)
 *
 * Cadence guidance: daily. Cheap query, idempotent (the dedup key on
 * (entityType, entityId) means re-running on the same day doesn't
 * spam — a notification only goes out once per stale snapshot).
 */

const DEFAULT_THRESHOLD_DAYS = 7;
const NOTIFICATION_DEDUP_WINDOW_DAYS = 7;

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

  const url = new URL(request.url);
  const thresholdDays = (() => {
    const explicit = url.searchParams.get('days');
    if (explicit) {
      const n = Number(explicit);
      if (Number.isInteger(n) && n > 0 && n <= 365) return n;
    }
    return DEFAULT_THRESHOLD_DAYS;
  })();

  try {
    const cutoff = new Date(Date.now() - thresholdDays * 24 * 60 * 60 * 1000);
    const drafts = await prisma.researchSnapshot.findMany({
      where: {
        viewType: 'HOUSE',
        approvalStatus: 'DRAFT',
        snapshotDate: { lt: cutoff }
      },
      orderBy: { snapshotDate: 'asc' },
      take: 200,
      include: {
        marketUniverse: { select: { label: true } },
        submarket: { select: { label: true } },
        asset: { select: { assetCode: true } }
      }
    });

    // Dedup: only emit a notification when one hasn't already gone out
    // for this snapshot in the last NOTIFICATION_DEDUP_WINDOW_DAYS.
    const dedupCutoff = new Date(
      Date.now() - NOTIFICATION_DEDUP_WINDOW_DAYS * 24 * 60 * 60 * 1000
    );
    const existing = await prisma.notification.findMany({
      where: {
        entityType: 'ResearchSnapshot',
        entityId: { in: drafts.map((d) => d.id) },
        type: NotificationType.SYSTEM,
        createdAt: { gte: dedupCutoff }
      },
      select: { entityId: true }
    });
    const recentlyAlerted = new Set(existing.map((row) => row.entityId).filter(Boolean));

    let alertsEmitted = 0;
    for (const draft of drafts) {
      if (recentlyAlerted.has(draft.id)) continue;
      const ageDays = Math.floor(
        (Date.now() - draft.snapshotDate.getTime()) / (24 * 60 * 60 * 1000)
      );
      const scopeLabel =
        draft.asset?.assetCode ??
        draft.submarket?.label ??
        draft.marketUniverse?.label ??
        'unattributed';
      await createNotification({
        type: NotificationType.SYSTEM,
        severity:
          ageDays >= thresholdDays * 2 ? NotificationSeverity.CRITICAL : NotificationSeverity.WARN,
        title: `House view DRAFT ${ageDays}d old`,
        body: `${draft.title} (${scopeLabel}) has been DRAFT for ${ageDays} days. Approve, supersede, or reject before the next quarterly publication.`,
        entityType: 'ResearchSnapshot',
        entityId: draft.id,
        audienceRole: 'ANALYST'
      });
      alertsEmitted += 1;
    }

    await recordAuditEvent({
      actorIdentifier: 'ops-cron',
      actorRole: 'SYSTEM',
      action: 'research.stale_drafts.scan',
      entityType: 'ResearchSnapshot',
      requestPath: '/api/ops/research-stale-drafts',
      requestMethod: 'POST',
      statusLabel: 'OK',
      metadata: {
        thresholdDays,
        draftCount: drafts.length,
        alertsEmitted,
        skippedDueToDedup: drafts.length - alertsEmitted
      }
    });

    return NextResponse.json({
      ok: true,
      thresholdDays,
      draftCount: drafts.length,
      alertsEmitted,
      skippedDueToDedup: drafts.length - alertsEmitted,
      drafts: drafts.slice(0, 20).map((d) => ({
        id: d.id,
        title: d.title,
        snapshotDate: d.snapshotDate,
        ageDays: Math.floor(
          (Date.now() - d.snapshotDate.getTime()) / (24 * 60 * 60 * 1000)
        ),
        alerted: !recentlyAlerted.has(d.id)
      }))
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Stale-draft scan failed';
    await recordAuditEvent({
      actorIdentifier: 'ops-cron',
      actorRole: 'SYSTEM',
      action: 'research.stale_drafts.scan',
      entityType: 'ResearchSnapshot',
      requestPath: '/api/ops/research-stale-drafts',
      requestMethod: 'POST',
      statusLabel: 'FAILED',
      metadata: { error: message }
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
