import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildOpsWebhookMessage,
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
