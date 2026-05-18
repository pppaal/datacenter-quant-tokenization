import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildOpsWebhookMessage,
  getOpsWebhookTargets,
  listRecentOpsAlertDeliveries,
  maskOpsAlertDestination,
  parseOpsCycleAlertPayload,
  recordOpsAlertDelivery,
  replayOpsAlertDelivery,
  sendOpsWebhookAlerts,
  sendOpsWebhookAlert,
  shouldNotifyOpsWebhook
} from '@/lib/services/ops-alerts';

test('shouldNotifyOpsWebhook sends failures when a webhook is configured', () => {
  const decision = shouldNotifyOpsWebhook(
    {
      status: 'FAILED',
      actorIdentifier: 'ops@example.com',
      alertSummary: 'failure'
    },
    {
      OPS_ALERT_WEBHOOK_URL: 'https://hooks.example.com/ops'
    } as unknown as NodeJS.ProcessEnv
  );

  assert.equal(decision.enabled, true);
  assert.equal(decision.reason, 'failed');
});

test('shouldNotifyOpsWebhook suppresses retry recovery alerts unless explicitly enabled', () => {
  const suppressed = shouldNotifyOpsWebhook(
    {
      status: 'SUCCESS',
      actorIdentifier: 'ops@example.com',
      alertSummary: 'recovered',
      attemptSummary: {
        sourceAttemptCount: 2,
        researchAttemptCount: 1
      }
    },
    {
      OPS_ALERT_WEBHOOK_URL: 'https://hooks.example.com/ops',
      OPS_ALERT_NOTIFY_ON_RECOVERY: 'false'
    } as unknown as NodeJS.ProcessEnv
  );

  assert.equal(suppressed.enabled, false);
  assert.equal(suppressed.reason, 'recovery_suppressed');
});

test('buildOpsWebhookMessage serializes concise operator alert text', () => {
  const message = buildOpsWebhookMessage(
    {
      status: 'FAILED',
      actorIdentifier: 'ops@example.com',
      alertSummary: 'source refresh failed',
      attemptSummary: {
        sourceAttemptCount: 2,
        researchAttemptCount: 0
      },
      errorMessage: 'timeout',
      sourceRun: {
        id: 'source_run_1'
      }
    },
    {
      NODE_ENV: 'production'
    } as NodeJS.ProcessEnv
  );

  assert.match(message.text, /ops-cycle failed/i);
  assert.match(message.text, /environment=production/i);
  assert.match(message.text, /source_run=source_run_1/i);
  assert.match(message.text, /error=timeout/i);
});

test('sendOpsWebhookAlert posts JSON payload when notification is enabled', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];

  const result = await sendOpsWebhookAlert(
    {
      status: 'FAILED',
      actorIdentifier: 'ops@example.com',
      alertSummary: 'failure'
    },
    {
      OPS_ALERT_WEBHOOK_URL: 'https://hooks.example.com/ops'
    } as unknown as NodeJS.ProcessEnv,
    async (url, init) => {
      calls.push({
        url: String(url),
        init: init ?? {}
      });
      return new Response(null, { status: 200 });
    }
  );

  assert.equal(result.delivered, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, 'https://hooks.example.com/ops');
  assert.equal(calls[0]?.init.method, 'POST');
  assert.match(String(calls[0]?.init.body), /ops-cycle failed/i);
});

test('getOpsWebhookTargets returns primary and distinct fallback destinations', () => {
  const targets = getOpsWebhookTargets({
    OPS_ALERT_WEBHOOK_URL: 'https://hooks.example.com/primary',
    OPS_ALERT_FALLBACK_WEBHOOK_URL: 'https://hooks.example.com/secondary'
  } as unknown as NodeJS.ProcessEnv);

  assert.deepEqual(
    targets.map((target) => target.channel),
    ['webhook_primary', 'webhook_secondary']
  );
});

test('sendOpsWebhookAlerts falls back to secondary webhook after primary failure', async () => {
  const calls: string[] = [];
  const result = await sendOpsWebhookAlerts(
    {
      status: 'FAILED',
      actorIdentifier: 'ops@example.com',
      alertSummary: 'failure'
    },
    {
      OPS_ALERT_WEBHOOK_URL: 'https://hooks.example.com/primary',
      OPS_ALERT_FALLBACK_WEBHOOK_URL: 'https://hooks.example.com/secondary'
    } as unknown as NodeJS.ProcessEnv,
    async (url) => {
      calls.push(String(url));
      if (String(url).includes('/primary')) {
        return new Response(null, { status: 500 });
      }
      return new Response(null, { status: 200 });
    }
  );

  assert.equal(result.deliveredAny, true);
  assert.equal(result.attempts.length, 2);
  assert.equal(result.attempts[0]?.channel, 'webhook_primary');
  assert.equal(result.attempts[0]?.delivered, false);
  assert.equal(result.attempts[1]?.channel, 'webhook_secondary');
  assert.equal(result.attempts[1]?.delivered, true);
  assert.deepEqual(calls, [
    'https://hooks.example.com/primary',
    'https://hooks.example.com/secondary'
  ]);
});

test('recordOpsAlertDelivery persists delivery metadata', async () => {
  let created: any;
  const result = await recordOpsAlertDelivery(
    {
      channel: 'webhook',
      destination: 'https://hooks.example.com/ops',
      statusLabel: 'DELIVERED',
      reason: 'failed',
      actorIdentifier: 'ops@example.com',
      environmentLabel: 'preview',
      deliveredAt: new Date('2026-04-07T00:00:00.000Z')
    },
    {
      opsAlertDelivery: {
        async create(args: any) {
          created = args.data;
          return {
            id: 'delivery_1',
            createdAt: new Date('2026-04-07T00:00:00.000Z'),
            ...args.data
          };
        }
      }
    } as any
  );

  assert.equal(created.channel, 'webhook');
  assert.equal(created.destination, 'https://hooks.example.com/ops');
  assert.equal(result.id, 'delivery_1');
});

test('maskOpsAlertDestination removes query secrets from webhook urls', () => {
  assert.equal(
    maskOpsAlertDestination('https://hooks.example.com/ops?token=secret&sig=abc'),
    'https://hooks.example.com/ops'
  );
});

test('listRecentOpsAlertDeliveries returns latest delivery attempts', async () => {
  const results = await listRecentOpsAlertDeliveries(
    {
      opsAlertDelivery: {
        async findMany(args: any) {
          assert.equal(args.take, 2);
          return [
            {
              id: 'delivery_1',
              channel: 'webhook',
              destination: 'https://hooks.example.com/ops',
              statusLabel: 'SKIPPED',
              reason: 'missing_webhook',
              actorIdentifier: 'ops@example.com',
              environmentLabel: 'preview',
              errorMessage: null,
              deliveredAt: null,
              createdAt: new Date('2026-04-07T00:00:00.000Z')
            }
          ];
        }
      }
    } as any,
    {
      limit: 2
    }
  );

  assert.equal(results.length, 1);
  assert.equal(results[0]?.statusLabel, 'SKIPPED');
});

test('parseOpsCycleAlertPayload accepts persisted ops payloads', () => {
  const parsed = parseOpsCycleAlertPayload({
    status: 'FAILED',
    actorIdentifier: 'ops@example.com',
    alertSummary: 'source refresh failed',
    attemptSummary: {
      sourceAttemptCount: 2,
      researchAttemptCount: 1
    },
    sourceRun: {
      id: 'source_run_1',
      statusLabel: 'FAILED'
    }
  } as any);

  assert.equal(parsed?.status, 'FAILED');
  assert.equal(parsed?.attemptSummary?.sourceAttemptCount, 2);
  assert.equal(parsed?.sourceRun?.id, 'source_run_1');
});

test('replayOpsAlertDelivery replays persisted webhook payloads', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const result = await replayOpsAlertDelivery(
    {
      id: 'delivery_1',
      channel: 'webhook',
      destination: 'https://hooks.example.com/ops',
      statusLabel: 'FAILED',
      reason: 'failed',
      actorIdentifier: 'ops@example.com',
      environmentLabel: 'test',
      errorMessage: 'timeout',
      deliveredAt: null,
      createdAt: new Date('2026-04-07T00:00:00.000Z'),
      payload: {
        status: 'FAILED',
        actorIdentifier: 'ops@example.com',
        alertSummary: 'source refresh failed'
      }
    },
    {
      OPS_ALERT_WEBHOOK_URL: 'https://hooks.example.com/ops'
    } as unknown as NodeJS.ProcessEnv,
    async (url, init) => {
      calls.push({
        url: String(url),
        init
      });
      return new Response(null, { status: 200 });
    }
  );

  assert.equal(result.delivered, true);
  assert.equal(calls[0]?.url, 'https://hooks.example.com/ops');
});
