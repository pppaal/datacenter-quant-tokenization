/**
 * Production preflight: hard-fails when the runtime environment is missing
 * any setting required to safely serve real users.
 *
 * Run this before flipping a build to production traffic — for example as a
 * post-deploy step that promotes the deployment only on success:
 *
 *   tsx scripts/run-production-preflight.ts
 *
 * Categories checked:
 *   1. core secrets (DB, session, ops cron)
 *   2. document storage (S3 bucket required, local FS forbidden)
 *   3. blockchain (mock mode forbidden in production)
 *   4. admin auth (OIDC recommended, basic-auth fallback forbidden)
 *   5. observability (crash-reporting backend AND ops paging webhook REQUIRED)
 *   6. escape hatches (Playwright mutation flag must be off)
 *
 * Exit code is 1 on any failure. Warnings do not fail; they are surfaced so
 * an operator can decide whether to ship.
 *
 * The check logic lives in `collectPreflightIssues(env)`, which is pure (it
 * reads only the env map it is handed, never `process.env` directly) so it can
 * be unit-tested with fixtures.
 */
import { logger } from '@/lib/observability/logger';

export type Issue = { severity: 'error' | 'warn'; key: string; detail: string };

type Env = Record<string, string | undefined>;

function isTrue(value: string | undefined): boolean {
  if (!value) return false;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function require(env: Env, name: string, issues: Issue[]): void {
  const value = env[name]?.trim();
  if (!value) {
    issues.push({ severity: 'error', key: name, detail: `${name} is required in production.` });
  }
}

function forbid(env: Env, name: string, issues: Issue[], reason: string): void {
  if (isTrue(env[name])) {
    issues.push({ severity: 'error', key: name, detail: reason });
  }
}

function recommend(env: Env, name: string, issues: Issue[], reason: string): void {
  const value = env[name]?.trim();
  if (!value) {
    issues.push({ severity: 'warn', key: name, detail: reason });
  }
}

function checkSecretStrength(env: Env, name: string, minLength: number, issues: Issue[]): void {
  const value = env[name]?.trim();
  if (!value) return; // require() handles the missing case
  if (value === 'dev-secret-not-for-production') {
    issues.push({
      severity: 'error',
      key: name,
      detail: `${name} is still set to the dev placeholder. Rotate to a real secret.`
    });
    return;
  }
  if (value.length < minLength) {
    issues.push({
      severity: 'error',
      key: name,
      detail: `${name} must be at least ${minLength} characters of entropy.`
    });
  }
}

/**
 * Pure preflight evaluation: given an environment map, return every issue.
 * Reads only the `env` argument so it is deterministic and unit-testable.
 */
export function collectPreflightIssues(env: Env): Issue[] {
  const issues: Issue[] = [];

  if (env.NODE_ENV !== 'production') {
    issues.push({
      severity: 'warn',
      key: 'NODE_ENV',
      detail: `NODE_ENV is "${env.NODE_ENV ?? 'unset'}", not "production". Preflight is most useful with NODE_ENV=production.`
    });
  }

  // 1. Core secrets
  require(env, 'DATABASE_URL', issues);
  require(env, 'APP_BASE_URL', issues);
  require(env, 'ADMIN_SESSION_SECRET', issues);
  checkSecretStrength(env, 'ADMIN_SESSION_SECRET', 32, issues);
  require(env, 'OPS_CRON_TOKEN', issues);
  checkSecretStrength(env, 'OPS_CRON_TOKEN', 24, issues);

  // 1b. Distributed rate limiting. The in-process limiters (login brute-force,
  // KYC webhook, property-analyze) are per-instance, so on multi-instance
  // serverless the effective limit is N× without a shared counter. Require
  // Upstash so the cross-instance throttle is actually in force in production.
  require(env, 'UPSTASH_REDIS_REST_URL', issues);
  require(env, 'UPSTASH_REDIS_REST_TOKEN', issues);

  // 2. Document storage
  if (!env.DOCUMENT_STORAGE_BUCKET?.trim()) {
    issues.push({
      severity: 'error',
      key: 'DOCUMENT_STORAGE_BUCKET',
      detail:
        'DOCUMENT_STORAGE_BUCKET is required in production. Vercel serverless filesystem is not durable outside /tmp.'
    });
  }

  // 3. Blockchain
  if (isTrue(env.BLOCKCHAIN_MOCK_MODE)) {
    issues.push({
      severity: 'error',
      key: 'BLOCKCHAIN_MOCK_MODE',
      detail:
        'BLOCKCHAIN_MOCK_MODE=true must not be used in production. Configure BLOCKCHAIN_RPC_URL + BLOCKCHAIN_PRIVATE_KEY + BLOCKCHAIN_REGISTRY_ADDRESS instead.'
    });
  } else {
    require(env, 'BLOCKCHAIN_RPC_URL', issues);
    require(env, 'BLOCKCHAIN_PRIVATE_KEY', issues);
    require(env, 'BLOCKCHAIN_REGISTRY_ADDRESS', issues);
  }

  // 4. Admin auth
  if (!env.ADMIN_OIDC_ISSUER_URL?.trim() && !env.ADMIN_OIDC_CLIENT_ID?.trim()) {
    issues.push({
      severity: 'warn',
      key: 'ADMIN_OIDC_*',
      detail:
        'OIDC SSO is not configured. Browser admins will fall back to basic-auth, which is acceptable only for short-lived staging windows.'
    });
  }
  if (
    env.ADMIN_BASIC_AUTH_USER?.trim() &&
    env.ADMIN_BASIC_AUTH_PASSWORD?.trim() &&
    !env.ADMIN_OIDC_ISSUER_URL?.trim()
  ) {
    issues.push({
      severity: 'warn',
      key: 'ADMIN_BASIC_AUTH_PASSWORD',
      detail:
        'Shared basic-auth credentials are configured but OIDC is not. Plan to migrate to OIDC before enrolling more than one operator.'
    });
  }
  if (isTrue(env.ADMIN_ALLOW_UNBOUND_BROWSER_SESSION)) {
    issues.push({
      severity: 'error',
      key: 'ADMIN_ALLOW_UNBOUND_BROWSER_SESSION',
      detail:
        'ADMIN_ALLOW_UNBOUND_BROWSER_SESSION=true bypasses canonical seat checks; never enable in production.'
    });
  }

  // 5. Observability — a production deploy must not run blind.
  //
  // 5a. Crash reporting. Require AT LEAST ONE of SENTRY_DSN (exceptions →
  // Sentry) or ERROR_REPORT_WEBHOOK_URL (reportError webhook). Without either,
  // runtime errors land only in ephemeral Vercel logs with no alerting path.
  if (!env.SENTRY_DSN?.trim() && !env.ERROR_REPORT_WEBHOOK_URL?.trim()) {
    issues.push({
      severity: 'error',
      key: 'SENTRY_DSN|ERROR_REPORT_WEBHOOK_URL',
      detail:
        'No crash-reporting backend configured. Set at least one of SENTRY_DSN or ERROR_REPORT_WEBHOOK_URL so runtime errors are captured and alertable, not just buried in Vercel logs.'
    });
  }

  // 5b. Ops paging. Required: failed cron / source-refresh / research-sync runs
  // must page someone, or silent data-pipeline failures go unnoticed.
  require(env, 'OPS_ALERT_WEBHOOK_URL', issues);

  // 6. Escape hatches
  forbid(
    env,
    'PLAYWRIGHT_ALLOW_HOSTED_MUTATIONS',
    issues,
    'PLAYWRIGHT_ALLOW_HOSTED_MUTATIONS=true exposes destructive E2E flows; must be off in production.'
  );
  forbid(
    env,
    'E2E_PRODUCTION_BUILD',
    issues,
    'E2E_PRODUCTION_BUILD=true disables production-only hard-blocks (mock blockchain writes, local document storage); it is an E2E-only escape hatch and must be off in production.'
  );
  forbid(
    env,
    'ADMIN_SCOPE_ALLOW_UNGRANTED_MUTATIONS',
    issues,
    'ADMIN_SCOPE_ALLOW_UNGRANTED_MUTATIONS=true reverts row-level write authorization to fail-OPEN (un-granted non-ADMIN analysts may mutate any scope); it is a migration aid only and must be off in production. (The runtime also self-disables it under real production.)'
  );

  // 7. IP / WAF posture
  recommend(
    env,
    'ADMIN_IP_ALLOWLIST',
    issues,
    'ADMIN_IP_ALLOWLIST is empty. Consider restricting /admin/* and /api/admin/* to the office or VPN egress.'
  );
  recommend(
    env,
    'OPS_IP_ALLOWLIST',
    issues,
    'OPS_IP_ALLOWLIST is empty. Consider restricting /api/ops/* to the scheduled cron egress IPs.'
  );

  return issues;
}

function main(): void {
  const issues = collectPreflightIssues(process.env);

  const errors = issues.filter((issue) => issue.severity === 'error');
  const warnings = issues.filter((issue) => issue.severity === 'warn');

  for (const warn of warnings) {
    logger.warn('preflight_warning', { key: warn.key, detail: warn.detail });
  }
  for (const err of errors) {
    logger.error('preflight_failure', { key: err.key, detail: err.detail });
  }

  if (errors.length > 0) {
    logger.error('preflight_blocked', {
      errorCount: errors.length,
      warningCount: warnings.length
    });
    process.exit(1);
  }

  logger.info('preflight_passed', {
    warningCount: warnings.length,
    note: warnings.length > 0 ? 'Warnings present; review before high-stakes ship.' : 'No warnings.'
  });
}

// Run only when executed directly (not when imported by the unit test).
if (process.argv[1] && process.argv[1].endsWith('run-production-preflight.ts')) {
  main();
}
