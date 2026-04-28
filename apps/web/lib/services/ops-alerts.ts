import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';

type OpsRunSummary = {
  id?: string;
  statusLabel?: string;
};

export type OpsAlertDeliveryRecord = {
  id: string;
  channel: string;
  destination: string;
  statusLabel: string;
  reason: string | null;
  actorIdentifier: string | null;
  environmentLabel: string | null;
  errorMessage: string | null;
  deliveredAt: Date | null;
  createdAt: Date;
};

export type OpsCycleAlertPayload = {
  status: 'SUCCESS' | 'FAILED';
  actorIdentifier: string;
  alertSummary: string;
  attemptSummary?: {
    sourceAttemptCount: number;
    researchAttemptCount: number;
  };
  sourceRun?: OpsRunSummary | null;
  researchRun?: OpsRunSummary | null;
  errorMessage?: string | null;
};

export type OpsAlertReplayableDelivery = {
  id: string;
  channel: string;
  destination: string;
  statusLabel: string;
  reason: string | null;
  actorIdentifier: string | null;
  environmentLabel: string | null;
  errorMessage: string | null;
  payload: Prisma.JsonValue | null;
  deliveredAt: Date | null;
  createdAt: Date;
};

type OpsWebhookTarget = {
  channel: 'webhook_primary' | 'webhook_secondary' | 'webhook_pager';
  url: string;
};

export type OpsWebhookAttempt = {
  channel: OpsWebhookTarget['channel'];
  destination: string;
  delivered: boolean;
  reason: string;
  errorMessage?: string | null;
};

export function maskOpsAlertDestination(destination: string) {
  const trimmed = destination.trim();
  if (!trimmed) {
    return 'redacted';
  }

  try {
    const url = new URL(trimmed);
    const pathname = url.pathname && url.pathname !== '/' ? url.pathname : '';
    return `${url.origin}${pathname}`;
  } catch {
    const separatorIndex = trimmed.indexOf('?');
    const sanitized = separatorIndex >= 0 ? trimmed.slice(0, separatorIndex) : trimmed;
    return sanitized.length > 48 ? `${sanitized.slice(0, 48)}...` : sanitized;
  }
}

export function shouldNotifyOpsWebhook(
  payload: OpsCycleAlertPayload,
  env: NodeJS.ProcessEnv = process.env
) {
  const webhookUrl = env.OPS_ALERT_WEBHOOK_URL?.trim() ?? '';
  if (!webhookUrl) {
    return {
      enabled: false,
      webhookUrl: '',
      reason: 'missing_webhook'
    } as const;
  }

  const notifyOnRecovery =
    (env.OPS_ALERT_NOTIFY_ON_RECOVERY?.trim().toLowerCase() ?? 'false') === 'true';
  const retried =
    (payload.attemptSummary?.sourceAttemptCount ?? 1) > 1 ||
    (payload.attemptSummary?.researchAttemptCount ?? 1) > 1;

  if (payload.status === 'FAILED') {
    return {
      enabled: true,
      webhookUrl,
      reason: 'failed'
    } as const;
  }

  if (retried && notifyOnRecovery) {
    return {
      enabled: true,
      webhookUrl,
      reason: 'recovered'
    } as const;
  }

  return {
    enabled: false,
    webhookUrl,
    reason: retried ? 'recovery_suppressed' : 'success_suppressed'
  } as const;
}

export function getOpsWebhookTargets(env: NodeJS.ProcessEnv = process.env): OpsWebhookTarget[] {
  const primary = env.OPS_ALERT_WEBHOOK_URL?.trim() ?? '';
  const secondary = env.OPS_ALERT_FALLBACK_WEBHOOK_URL?.trim() ?? '';
  const pager = env.OPS_ALERT_PAGER_WEBHOOK_URL?.trim() ?? '';
  const targets: OpsWebhookTarget[] = [];

  if (primary) {
    targets.push({
      channel: 'webhook_primary',
      url: primary
    });
  }

  if (secondary && secondary !== primary) {
    targets.push({
      channel: 'webhook_secondary',
      url: secondary
    });
  }

  if (pager && pager !== primary && pager !== secondary) {
    targets.push({
      channel: 'webhook_pager',
      url: pager
    });
  }

  return targets;
}

export function buildOpsWebhookMessage(
  payload: OpsCycleAlertPayload,
  env: NodeJS.ProcessEnv = process.env
) {
  const environmentLabel = env.VERCEL_ENV?.trim() || env.NODE_ENV?.trim() || 'unknown';
  const lines = [
    `environment=${environmentLabel}`,
    `actor=${payload.actorIdentifier}`,
    `status=${payload.status.toLowerCase()}`,
    `summary=${payload.alertSummary}`
  ];

  if (payload.attemptSummary) {
    lines.push(
      `attempts=source:${payload.attemptSummary.sourceAttemptCount},research:${payload.attemptSummary.researchAttemptCount}`
    );
  }

  if (payload.sourceRun?.id) {
    lines.push(`source_run=${payload.sourceRun.id}`);
  }

  if (payload.researchRun?.id) {
    lines.push(`research_run=${payload.researchRun.id}`);
  }

  if (payload.errorMessage) {
    lines.push(`error=${payload.errorMessage}`);
  }

  return {
    text:
      payload.status === 'FAILED'
        ? `ops-cycle failed: ${lines.join(' | ')}`
        : `ops-cycle alert: ${lines.join(' | ')}`
  };
}

export async function sendOpsWebhookAlert(
  payload: OpsCycleAlertPayload,
  env: NodeJS.ProcessEnv = process.env,
  fetchFn: typeof fetch = fetch
) {
  const decision = shouldNotifyOpsWebhook(payload, env);
  if (!decision.enabled) {
    return {
      delivered: false,
      reason: decision.reason
    } as const;
  }

  const response = await fetchFn(decision.webhookUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify(buildOpsWebhookMessage(payload, env))
  });

  if (!response.ok) {
    throw new Error(`Ops webhook returned ${response.status}`);
  }

  return {
    delivered: true,
    reason: decision.reason
  } as const;
}

export async function sendOpsWebhookAlerts(
  payload: OpsCycleAlertPayload,
  env: NodeJS.ProcessEnv = process.env,
  fetchFn: typeof fetch = fetch
) {
  const decision = shouldNotifyOpsWebhook(payload, env);
  const targets = getOpsWebhookTargets(env);

  if (!decision.enabled || targets.length === 0) {
    return {
      deliveredAny: false,
      attempts: [
        {
          channel: 'webhook_primary',
          destination: targets[0]?.url ?? 'not_configured',
          delivered: false,
          reason: targets.length === 0 ? 'missing_webhook' : decision.reason
        }
      ] satisfies OpsWebhookAttempt[]
    };
  }

  const attempts: OpsWebhookAttempt[] = [];

  for (const target of targets) {
    try {
      const response = await fetchFn(target.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify(buildOpsWebhookMessage(payload, env))
      });

      if (!response.ok) {
        throw new Error(`Ops webhook returned ${response.status}`);
      }

      attempts.push({
        channel: target.channel,
        destination: target.url,
        delivered: true,
        reason: attempts.length > 0 ? 'fallback_delivered' : decision.reason
      });

      return {
        deliveredAny: true,
        attempts
      };
    } catch (error) {
      attempts.push({
        channel: target.channel,
        destination: target.url,
        delivered: false,
        reason: attempts.length > 0 ? 'fallback_delivery_error' : 'delivery_error',
        errorMessage: error instanceof Error ? error.message : 'Failed to deliver ops webhook.'
      });
    }
  }

  return {
    deliveredAny: false,
    attempts
  };
}

/**
 * Stable fingerprint for an alert payload. Two payloads with identical
 * status + summary + error produce the same fingerprint and are considered
 * duplicates within `OPS_ALERT_DEDUP_WINDOW_MINUTES` (default 30).
 */
export function computeOpsAlertFingerprint(payload: OpsCycleAlertPayload): string {
  const canonical = [
    payload.status,
    payload.alertSummary?.trim() ?? '',
    payload.errorMessage?.trim() ?? '',
    payload.sourceRun?.statusLabel ?? '',
    payload.researchRun?.statusLabel ?? ''
  ].join('|');
  return createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}

function dedupWindowMs(env: NodeJS.ProcessEnv): number {
  const raw = Number(env.OPS_ALERT_DEDUP_WINDOW_MINUTES ?? 30);
  if (!Number.isFinite(raw) || raw <= 0) return 30 * 60 * 1000;
  return Math.floor(raw) * 60 * 1000;
}

/**
 * Returns true when an alert with the same fingerprint was delivered in
 * the dedup window, so the caller should skip re-sending. Soft-fails on
 * DB errors (returns false) so an outage of the audit table never silences
 * a real incident.
 */
export async function isDuplicateOpsAlert(
  fingerprint: string,
  db: {
    opsAlertDelivery: {
      findFirst(args: {
        where: { reason: string; deliveredAt: { gte: Date } };
        orderBy: { deliveredAt: 'desc' };
      }): Promise<{ id: string } | null>;
    };
  },
  env: NodeJS.ProcessEnv = process.env
): Promise<boolean> {
  try {
    const cutoff = new Date(Date.now() - dedupWindowMs(env));
    const reason = `fingerprint:${fingerprint}`;
    const recent = await db.opsAlertDelivery.findFirst({
      where: { reason, deliveredAt: { gte: cutoff } },
      orderBy: { deliveredAt: 'desc' }
    });
    return Boolean(recent);
  } catch {
    return false;
  }
}

export async function recordOpsAlertDelivery(
  input: {
    channel: string;
    destination: string;
    statusLabel: string;
    reason?: string | null;
    actorIdentifier?: string | null;
    environmentLabel?: string | null;
    errorMessage?: string | null;
    payload?: Prisma.InputJsonValue;
    deliveredAt?: Date | null;
  },
  db: {
    opsAlertDelivery: {
      create(args: {
        data: {
          channel: string;
          destination: string;
          statusLabel: string;
          reason?: string | null;
          actorIdentifier?: string | null;
          environmentLabel?: string | null;
          errorMessage?: string | null;
          payload?: Prisma.InputJsonValue;
          deliveredAt?: Date | null;
        };
      }): Promise<OpsAlertDeliveryRecord>;
    };
  }
) {
  const maskedDestination = maskOpsAlertDestination(input.destination);

  return db.opsAlertDelivery.create({
    data: {
      channel: input.channel,
      destination: maskedDestination,
      statusLabel: input.statusLabel,
      reason: input.reason ?? null,
      actorIdentifier: input.actorIdentifier ?? null,
      environmentLabel: input.environmentLabel ?? null,
      errorMessage: input.errorMessage ?? null,
      payload: input.payload ?? undefined,
      deliveredAt: input.deliveredAt ?? null
    }
  });
}

export async function persistOpsAlertAttempts(
  attempts: Array<{
    channel: string;
    destination: string;
    delivered: boolean;
    reason: string;
    errorMessage?: string | null;
  }>,
  input: {
    actorIdentifier: string;
    environmentLabel: string;
    payload: Prisma.InputJsonValue;
  },
  db: {
    opsAlertDelivery: {
      create(args: {
        data: {
          channel: string;
          destination: string;
          statusLabel: string;
          reason?: string | null;
          actorIdentifier?: string | null;
          environmentLabel?: string | null;
          errorMessage?: string | null;
          payload?: Prisma.InputJsonValue;
          deliveredAt?: Date | null;
        };
      }): Promise<OpsAlertDeliveryRecord>;
    };
  }
) {
  for (const attempt of attempts) {
    await recordOpsAlertDelivery(
      {
        channel: attempt.channel,
        destination: attempt.destination,
        statusLabel: attempt.delivered ? 'DELIVERED' : 'FAILED',
        reason: attempt.reason,
        actorIdentifier: input.actorIdentifier,
        environmentLabel: input.environmentLabel,
        errorMessage: attempt.errorMessage ?? null,
        payload: input.payload,
        deliveredAt: attempt.delivered ? new Date() : null
      },
      db
    );
  }
}

export async function listRecentOpsAlertDeliveries(
  db: {
    opsAlertDelivery: {
      findMany(args: {
        take: number;
        orderBy: {
          createdAt: 'desc';
        };
      }): Promise<OpsAlertDeliveryRecord[]>;
    };
  },
  options?: {
    limit?: number;
  }
) {
  return db.opsAlertDelivery.findMany({
    take: options?.limit ?? 12,
    orderBy: {
      createdAt: 'desc'
    }
  });
}

export function parseOpsCycleAlertPayload(payload: Prisma.JsonValue | null | undefined): OpsCycleAlertPayload | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }

  const candidate = payload as Record<string, unknown>;
  const status = candidate.status;
  const actorIdentifier = candidate.actorIdentifier;
  const alertSummary = candidate.alertSummary;

  if ((status !== 'SUCCESS' && status !== 'FAILED') || typeof actorIdentifier !== 'string' || typeof alertSummary !== 'string') {
    return null;
  }

  const attemptSummaryCandidate =
    candidate.attemptSummary && typeof candidate.attemptSummary === 'object' && !Array.isArray(candidate.attemptSummary)
      ? (candidate.attemptSummary as Record<string, unknown>)
      : null;
  const sourceRunCandidate =
    candidate.sourceRun && typeof candidate.sourceRun === 'object' && !Array.isArray(candidate.sourceRun)
      ? (candidate.sourceRun as Record<string, unknown>)
      : null;
  const researchRunCandidate =
    candidate.researchRun && typeof candidate.researchRun === 'object' && !Array.isArray(candidate.researchRun)
      ? (candidate.researchRun as Record<string, unknown>)
      : null;

  return {
    status,
    actorIdentifier,
    alertSummary,
    attemptSummary: attemptSummaryCandidate
      ? {
          sourceAttemptCount: Number(attemptSummaryCandidate.sourceAttemptCount ?? 1),
          researchAttemptCount: Number(attemptSummaryCandidate.researchAttemptCount ?? 1)
        }
      : undefined,
    sourceRun: sourceRunCandidate
      ? {
          id: typeof sourceRunCandidate.id === 'string' ? sourceRunCandidate.id : undefined,
          statusLabel: typeof sourceRunCandidate.statusLabel === 'string' ? sourceRunCandidate.statusLabel : undefined
        }
      : undefined,
    researchRun: researchRunCandidate
      ? {
          id: typeof researchRunCandidate.id === 'string' ? researchRunCandidate.id : undefined,
          statusLabel: typeof researchRunCandidate.statusLabel === 'string' ? researchRunCandidate.statusLabel : undefined
        }
      : undefined,
    errorMessage: typeof candidate.errorMessage === 'string' ? candidate.errorMessage : null
  };
}

export async function replayOpsAlertDelivery(
  delivery: OpsAlertReplayableDelivery,
  env: NodeJS.ProcessEnv = process.env,
  fetchFn: typeof fetch = fetch
) {
  const payload = parseOpsCycleAlertPayload(delivery.payload);
  if (!payload) {
    return {
      delivered: false,
      reason: 'invalid_payload'
    } as const;
  }

  const targets = getOpsWebhookTargets(env);
  const matchingTarget =
    delivery.channel === 'webhook_secondary'
      ? targets.find((target) => target.channel === 'webhook_secondary')
      : targets.find((target) => target.channel === 'webhook_primary') ?? targets[0];

  if (!matchingTarget) {
    return {
      delivered: false,
      reason: 'missing_webhook'
    } as const;
  }

  const response = await fetchFn(matchingTarget.url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify(buildOpsWebhookMessage(payload, env))
  });

  if (!response.ok) {
    throw new Error(`Ops webhook returned ${response.status}`);
  }

  return {
    delivered: true,
    reason: delivery.channel === 'webhook_secondary' ? 'replayed_secondary' : 'replayed_primary'
  } as const;
}
