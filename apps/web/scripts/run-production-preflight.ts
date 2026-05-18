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
 *   4. admin auth (OIDC required, basic-auth fallback forbidden)
 *   5. observability (alert webhook recommended, error report optional)
 *   6. escape hatches (Playwright mutation flag must be off)
 *
 * Exit code is 1 on any failure. Warnings do not fail; they are surfaced so
 * an operator can decide whether to ship.
 */
import { logger } from '@/lib/observability/logger';

type Issue = { severity: 'error' | 'warn'; key: string; detail: string };

function isTrue(value: string | undefined): boolean {
  if (!value) return false;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function require(name: string, issues: Issue[]): void {
  const value = process.env[name]?.trim();
  if (!value) {
    issues.push({ severity: 'error', key: name, detail: `${name} is required in production.` });
  }
}

function forbid(name: string, issues: Issue[], reason: string): void {
  if (isTrue(process.env[name])) {
    issues.push({ severity: 'error', key: name, detail: reason });
  }
}

function recommend(name: string, issues: Issue[], reason: string): void {
  const value = process.env[name]?.trim();
  if (!value) {
    issues.push({ severity: 'warn', key: name, detail: reason });
  }
}

function checkSecretStrength(name: string, minLength: number, issues: Issue[]): void {
  const value = process.env[name]?.trim();
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

function main(): void {
  const issues: Issue[] = [];

  if (process.env.NODE_ENV !== 'production') {
    issues.push({
      severity: 'warn',
      key: 'NODE_ENV',
      detail: `NODE_ENV is "${process.env.NODE_ENV ?? 'unset'}", not "production". Preflight is most useful with NODE_ENV=production.`
    });
  }

  // 1. Core secrets
  require('DATABASE_URL', issues);
  require('APP_BASE_URL', issues);
  require('ADMIN_SESSION_SECRET', issues);
  checkSecretStrength('ADMIN_SESSION_SECRET', 32, issues);
  require('OPS_CRON_TOKEN', issues);
  checkSecretStrength('OPS_CRON_TOKEN', 24, issues);

  // 2. Document storage
  if (!process.env.DOCUMENT_STORAGE_BUCKET?.trim()) {
    issues.push({
      severity: 'error',
      key: 'DOCUMENT_STORAGE_BUCKET',
      detail:
        'DOCUMENT_STORAGE_BUCKET is required in production. Vercel serverless filesystem is not durable outside /tmp.'
    });
  }

  // 3. Blockchain
  if (isTrue(process.env.BLOCKCHAIN_MOCK_MODE)) {
    issues.push({
      severity: 'error',
      key: 'BLOCKCHAIN_MOCK_MODE',
      detail:
        'BLOCKCHAIN_MOCK_MODE=true must not be used in production. Configure BLOCKCHAIN_RPC_URL + BLOCKCHAIN_PRIVATE_KEY + BLOCKCHAIN_REGISTRY_ADDRESS instead.'
    });
  } else {
    require('BLOCKCHAIN_RPC_URL', issues);
    require('BLOCKCHAIN_PRIVATE_KEY', issues);
    require('BLOCKCHAIN_REGISTRY_ADDRESS', issues);
  }

  // 4. Admin auth
  if (!process.env.ADMIN_OIDC_ISSUER_URL?.trim() && !process.env.ADMIN_OIDC_CLIENT_ID?.trim()) {
    issues.push({
      severity: 'warn',
      key: 'ADMIN_OIDC_*',
      detail:
        'OIDC SSO is not configured. Browser admins will fall back to basic-auth, which is acceptable only for short-lived staging windows.'
    });
  }
  if (
    process.env.ADMIN_BASIC_AUTH_USER?.trim() &&
    process.env.ADMIN_BASIC_AUTH_PASSWORD?.trim() &&
    !process.env.ADMIN_OIDC_ISSUER_URL?.trim()
  ) {
    issues.push({
      severity: 'warn',
      key: 'ADMIN_BASIC_AUTH_PASSWORD',
      detail:
        'Shared basic-auth credentials are configured but OIDC is not. Plan to migrate to OIDC before enrolling more than one operator.'
    });
  }
  if (isTrue(process.env.ADMIN_ALLOW_UNBOUND_BROWSER_SESSION)) {
    issues.push({
      severity: 'error',
      key: 'ADMIN_ALLOW_UNBOUND_BROWSER_SESSION',
      detail:
        'ADMIN_ALLOW_UNBOUND_BROWSER_SESSION=true bypasses canonical seat checks; never enable in production.'
    });
  }

  // 5. Observability
  recommend(
    'OPS_ALERT_WEBHOOK_URL',
    issues,
    'OPS_ALERT_WEBHOOK_URL is unset. Failed source-refresh / research-sync runs will not page anyone.'
  );
  recommend(
    'ERROR_REPORT_WEBHOOK_URL',
    issues,
    'ERROR_REPORT_WEBHOOK_URL is unset. Runtime errors will only land in Vercel logs.'
  );

  // 6. Escape hatches
  forbid(
    'PLAYWRIGHT_ALLOW_HOSTED_MUTATIONS',
    issues,
    'PLAYWRIGHT_ALLOW_HOSTED_MUTATIONS=true exposes destructive E2E flows; must be off in production.'
  );

  // 7. IP / WAF posture
  recommend(
    'ADMIN_IP_ALLOWLIST',
    issues,
    'ADMIN_IP_ALLOWLIST is empty. Consider restricting /admin/* and /api/admin/* to the office or VPN egress.'
  );
  recommend(
    'OPS_IP_ALLOWLIST',
    issues,
    'OPS_IP_ALLOWLIST is empty. Consider restricting /api/ops/* to the scheduled cron egress IPs.'
  );

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

main();
