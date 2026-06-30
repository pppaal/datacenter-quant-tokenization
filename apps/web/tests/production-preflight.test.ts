import assert from 'node:assert/strict';
import test from 'node:test';
import { collectPreflightIssues, type Issue } from '@/scripts/run-production-preflight';

/**
 * A fully-configured, safe production environment. Every individual test mutates
 * a copy of this to assert the preflight reacts to exactly that one change.
 */
function validProdEnv(): Record<string, string | undefined> {
  return {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgres://user:pass@db.internal:5432/app',
    APP_BASE_URL: 'https://app.example.com',
    ADMIN_SESSION_SECRET: 'x'.repeat(48),
    OPS_CRON_TOKEN: 'y'.repeat(32),
    UPSTASH_REDIS_REST_URL: 'https://redis.example.com',
    UPSTASH_REDIS_REST_TOKEN: 'token-value',
    DOCUMENT_STORAGE_BUCKET: 'prod-docs',
    BLOCKCHAIN_RPC_URL: 'https://rpc.example.com',
    BLOCKCHAIN_PRIVATE_KEY: '0xabc',
    BLOCKCHAIN_REGISTRY_ADDRESS: '0xdef',
    // Crash reporting + ops paging — the observability backend this change makes
    // mandatory.
    SENTRY_DSN: 'https://sentry.example.com/1',
    ERROR_REPORT_WEBHOOK_URL: 'https://errors.example.com/hook',
    OPS_ALERT_WEBHOOK_URL: 'https://alerts.example.com/hook',
    // OIDC configured so the basic-auth warning stays quiet.
    ADMIN_OIDC_ISSUER_URL: 'https://idp.example.com',
    ADMIN_OIDC_CLIENT_ID: 'client-id'
  };
}

function errorKeys(issues: Issue[]): string[] {
  return issues.filter((i) => i.severity === 'error').map((i) => i.key);
}

test('a fully-configured production env produces no errors', () => {
  const issues = collectPreflightIssues(validProdEnv());
  assert.deepEqual(errorKeys(issues), [], 'expected no preflight errors for a valid prod env');
});

test('escape hatch: ADMIN_SCOPE_ALLOW_UNGRANTED_MUTATIONS=true is a hard error in production', () => {
  const env = validProdEnv();
  env.ADMIN_SCOPE_ALLOW_UNGRANTED_MUTATIONS = 'true';
  const issues = collectPreflightIssues(env);
  assert.ok(
    errorKeys(issues).includes('ADMIN_SCOPE_ALLOW_UNGRANTED_MUTATIONS'),
    'the fail-open write escape hatch must be forbidden in production'
  );
});

test('escape hatch: ADMIN_SCOPE_ALLOW_UNGRANTED_MUTATIONS unset is fine', () => {
  const issues = collectPreflightIssues(validProdEnv());
  assert.ok(
    !errorKeys(issues).includes('ADMIN_SCOPE_ALLOW_UNGRANTED_MUTATIONS'),
    'unset escape hatch must not error'
  );
});

test('crash reporting: errors when BOTH SENTRY_DSN and ERROR_REPORT_WEBHOOK_URL are unset', () => {
  const env = validProdEnv();
  delete env.SENTRY_DSN;
  delete env.ERROR_REPORT_WEBHOOK_URL;
  const issues = collectPreflightIssues(env);
  assert.ok(
    errorKeys(issues).includes('SENTRY_DSN|ERROR_REPORT_WEBHOOK_URL'),
    'missing both crash-reporting backends must be a hard error'
  );
});

test('crash reporting: SENTRY_DSN alone satisfies the requirement', () => {
  const env = validProdEnv();
  delete env.ERROR_REPORT_WEBHOOK_URL;
  const issues = collectPreflightIssues(env);
  assert.ok(
    !errorKeys(issues).includes('SENTRY_DSN|ERROR_REPORT_WEBHOOK_URL'),
    'SENTRY_DSN alone should satisfy crash reporting'
  );
});

test('crash reporting: ERROR_REPORT_WEBHOOK_URL alone satisfies the requirement', () => {
  const env = validProdEnv();
  delete env.SENTRY_DSN;
  const issues = collectPreflightIssues(env);
  assert.ok(
    !errorKeys(issues).includes('SENTRY_DSN|ERROR_REPORT_WEBHOOK_URL'),
    'ERROR_REPORT_WEBHOOK_URL alone should satisfy crash reporting'
  );
});

test('ops paging: OPS_ALERT_WEBHOOK_URL is now a hard error when unset', () => {
  const env = validProdEnv();
  delete env.OPS_ALERT_WEBHOOK_URL;
  const issues = collectPreflightIssues(env);
  assert.ok(
    errorKeys(issues).includes('OPS_ALERT_WEBHOOK_URL'),
    'a missing ops paging webhook must now block promotion'
  );
});

test('OIDC absence remains a WARNING, not an error', () => {
  const env = validProdEnv();
  delete env.ADMIN_OIDC_ISSUER_URL;
  delete env.ADMIN_OIDC_CLIENT_ID;
  const issues = collectPreflightIssues(env);
  const oidc = issues.find((i) => i.key === 'ADMIN_OIDC_*');
  assert.ok(oidc, 'expected an OIDC issue');
  assert.equal(oidc!.severity, 'warn', 'OIDC must stay a warning per the runbook');
  assert.ok(
    !errorKeys(issues).includes('ADMIN_OIDC_*'),
    'OIDC absence must not be promoted to an error'
  );
});

test('blockchain: missing RPC keys is a hard error by default', () => {
  const env = validProdEnv();
  delete env.BLOCKCHAIN_RPC_URL;
  delete env.BLOCKCHAIN_PRIVATE_KEY;
  delete env.BLOCKCHAIN_REGISTRY_ADDRESS;
  const keys = errorKeys(collectPreflightIssues(env));
  assert.ok(keys.includes('BLOCKCHAIN_RPC_URL'), 'missing chain config must error by default');
});

test('blockchain: BLOCKCHAIN_DISABLED=true allows a no-chain deploy (warn, not error)', () => {
  const env = validProdEnv();
  delete env.BLOCKCHAIN_RPC_URL;
  delete env.BLOCKCHAIN_PRIVATE_KEY;
  delete env.BLOCKCHAIN_REGISTRY_ADDRESS;
  env.BLOCKCHAIN_DISABLED = 'true';
  const issues = collectPreflightIssues(env);
  // No chain-related errors when explicitly disabled...
  assert.deepEqual(errorKeys(issues), [], 'disabled on-chain must not produce preflight errors');
  // ...and the disabled state is surfaced as a warning.
  const disabled = issues.find((i) => i.key === 'BLOCKCHAIN_DISABLED');
  assert.ok(disabled && disabled.severity === 'warn', 'expected a BLOCKCHAIN_DISABLED warning');
});

test('blockchain: mock mode stays a hard error even when disabled is also set', () => {
  const env = validProdEnv();
  env.BLOCKCHAIN_MOCK_MODE = 'true';
  env.BLOCKCHAIN_DISABLED = 'true';
  const keys = errorKeys(collectPreflightIssues(env));
  assert.ok(keys.includes('BLOCKCHAIN_MOCK_MODE'), 'mock mode must never pass in production');
});

test('an empty env hard-fails, including the new observability errors', () => {
  const issues = collectPreflightIssues({ NODE_ENV: 'production' });
  const keys = errorKeys(issues);
  assert.ok(keys.includes('DATABASE_URL'));
  assert.ok(keys.includes('SENTRY_DSN|ERROR_REPORT_WEBHOOK_URL'));
  assert.ok(keys.includes('OPS_ALERT_WEBHOOK_URL'));
});
