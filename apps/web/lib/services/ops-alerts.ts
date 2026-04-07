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
  return db.opsAlertDelivery.create({
    data: {
      channel: input.channel,
      destination: input.destination,
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

  return sendOpsWebhookAlert(payload, env, fetchFn);
}
