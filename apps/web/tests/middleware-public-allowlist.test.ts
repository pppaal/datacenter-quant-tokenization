import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isPublicAdminPath, isPublicApiPath } from '@/middleware';

/**
 * Regression guard for the single auth gate's public allowlist. The allowlist
 * is the only thing standing between an anonymous caller and the admin/ops/
 * onchain/KYC-bridge surface, so a careless `startsWith` here (one that also
 * matches a sensitive sibling) would silently de-auth a whole route family.
 *
 * These cases pin the EXACT public set: anything not enumerated below must be
 * treated as non-public. If a future edit broadens a prefix, one of these
 * fails. Pure predicate checks — no network, no DB.
 */

const PUBLIC_API_PATHS = [
  '/api/health',
  '/api/inquiries',
  '/api/admin/session',
  '/api/admin/sso/login',
  '/api/admin/sso/callback',
  '/api/admin/scim/users',
  '/api/admin/scim/users/abc',
  '/api/admin/scim/sync',
  '/api/property-analyze',
  '/api/kyc/webhook/sumsub',
  '/api/public/im-deck',
  '/api/public/asset-media/abc'
];

// Sensitive routes that MUST stay behind the auth gate. Each is a plausible
// victim of an over-broad prefix match (e.g. a sibling of an allowlisted path).
const MUST_NOT_BE_PUBLIC = [
  // admin surface — only the three SSO/session/scim entries above are public
  '/api/admin/deals',
  '/api/admin/sessions', // not the singular `/api/admin/session`
  '/api/admin/session/refresh',
  '/api/admin/sso', // bare prefix, not the exact login/callback paths
  '/api/admin/sso/logout',
  '/api/admin/scim', // bare prefix (no trailing slash) is not allowlisted
  '/api/admin/users',
  // onchain / tokenization — irreversible writes, never public
  '/api/onchain/mint',
  '/api/tokenization/issue',
  // ops cron surface — gated by OPS_CRON_TOKEN, never cookie-public
  '/api/ops/run',
  // KYC non-webhook surface — only the webhook prefix is public
  '/api/kyc/sessions',
  '/api/kyc/webhook', // bare prefix (no trailing slash) is not allowlisted
  // property-analyze siblings — only the exact path is public
  '/api/property-analyze/history',
  '/api/property-analyzer',
  // health / inquiries siblings — only exact paths are public
  '/api/health/secrets',
  '/api/inquiries/list',
  // `/api/public` bare (no trailing slash) is not a real route and not public
  '/api/public'
];

test('every enumerated public API path is allowlisted', () => {
  for (const p of PUBLIC_API_PATHS) {
    assert.equal(isPublicApiPath(p), true, `${p} should be public`);
  }
});

test('no sensitive admin/ops/onchain/kyc route leaks through the allowlist', () => {
  for (const p of MUST_NOT_BE_PUBLIC) {
    assert.equal(isPublicApiPath(p), false, `${p} must NOT be public`);
  }
});

test('only /admin/login is a public admin page', () => {
  assert.equal(isPublicAdminPath('/admin/login'), true);
  for (const p of ['/admin', '/admin/login/extra', '/admin/dashboard', '/admin/deals']) {
    assert.equal(isPublicAdminPath(p), false, `${p} must NOT be a public admin page`);
  }
});
