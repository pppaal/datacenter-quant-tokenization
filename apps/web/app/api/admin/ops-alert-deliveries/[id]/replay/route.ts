import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getRequestIpAddress, resolveVerifiedAdminActorFromHeaders } from '@/lib/security/admin-request';
import { recordAuditEvent } from '@/lib/services/audit';
import { maskOpsAlertDestination, recordOpsAlertDelivery, replayOpsAlertDelivery } from '@/lib/services/ops-alerts';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await resolveVerifiedAdminActorFromHeaders(request.headers, prisma, {
    allowBasic: false,
    requireActiveSeat: true
  });
  const ipAddress = getRequestIpAddress(request.headers);

  if (!actor) {
    return NextResponse.json({ error: 'Active admin session required.' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const delivery = await prisma.opsAlertDelivery.findUnique({
      where: {
        id
      }
    });

    if (!delivery) {
      return NextResponse.json({ error: 'Ops alert delivery not found.' }, { status: 404 });
    }

    const replay = await replayOpsAlertDelivery(delivery);
    const recordedDelivery = await recordOpsAlertDelivery(
      {
        channel: delivery.channel,
        destination: delivery.destination,
        statusLabel: replay.delivered ? 'DELIVERED' : 'SKIPPED',
        reason: replay.reason,
        actorIdentifier: actor.identifier,
        environmentLabel: process.env.VERCEL_ENV?.trim() || process.env.NODE_ENV?.trim() || 'unknown',
        payload: delivery.payload ?? undefined,
        deliveredAt: replay.delivered ? new Date() : null
      },
      prisma
    );

    await recordAuditEvent({
      actorIdentifier: actor.identifier,
      actorRole: actor.role,
      action: 'ops_alert_delivery.replay',
      entityType: 'OpsAlertDelivery',
      entityId: recordedDelivery.id,
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress,
      statusLabel: 'SUCCESS',
      metadata: {
        replayedFromDeliveryId: delivery.id,
        destination: maskOpsAlertDestination(delivery.destination),
        replayStatus: recordedDelivery.statusLabel,
        replayReason: recordedDelivery.reason
      }
    });

    return NextResponse.json({
      ok: true,
      delivery: recordedDelivery
    });
  } catch (error) {
    let failedReplayDeliveryId: string | null = null;

    try {
      const { id } = await params;
      const originalDelivery = await prisma.opsAlertDelivery.findUnique({
        where: {
          id
        }
      });

      if (originalDelivery) {
        const failedReplayDelivery = await recordOpsAlertDelivery(
          {
            channel: originalDelivery.channel,
            destination: originalDelivery.destination,
            statusLabel: 'FAILED',
            reason: 'replay_failed',
            actorIdentifier: actor.identifier,
            environmentLabel: process.env.VERCEL_ENV?.trim() || process.env.NODE_ENV?.trim() || 'unknown',
            errorMessage: error instanceof Error ? error.message : 'Failed to replay ops alert delivery.',
            payload: originalDelivery.payload ?? undefined,
            deliveredAt: null
          },
          prisma
        );
        failedReplayDeliveryId = failedReplayDelivery.id;
      }
    } catch {
      failedReplayDeliveryId = null;
    }

    await recordAuditEvent({
      actorIdentifier: actor.identifier,
      actorRole: actor.role,
      action: 'ops_alert_delivery.replay',
      entityType: 'OpsAlertDelivery',
      entityId: failedReplayDeliveryId,
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress,
      statusLabel: 'FAILED',
      metadata: {
        error: error instanceof Error ? error.message : 'Failed to replay ops alert delivery.'
      }
    });

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to replay ops alert delivery.'
      },
      { status: 400 }
    );
  }
}
