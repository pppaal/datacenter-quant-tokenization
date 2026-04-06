type OpsRunSummary = {
  id?: string;
  statusLabel?: string;
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
