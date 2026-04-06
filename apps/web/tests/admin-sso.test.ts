import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAdminSsoAuthorizationUrl,
  getAdminSsoConfig,
  mapAdminSsoClaimsToActor
} from '@/lib/security/admin-sso';

test('admin sso config is disabled when oidc env is absent', () => {
  const config = getAdminSsoConfig({ NODE_ENV: 'test' } as NodeJS.ProcessEnv);
  assert.equal(config.mode, 'disabled');
});

test('admin sso maps configured claim roles into operator roles', () => {
  const config = getAdminSsoConfig({
    NODE_ENV: 'test',
    APP_BASE_URL: 'https://firm.example.com',
    ADMIN_OIDC_CLIENT_ID: 'client-id',
    ADMIN_OIDC_CLIENT_SECRET: 'client-secret',
    ADMIN_OIDC_ISSUER_URL: 'https://id.example.com',
    ADMIN_OIDC_ANALYST_ROLES: 'research,analyst',
    ADMIN_OIDC_ADMIN_ROLES: 'admin,platform-admin'
  } as NodeJS.ProcessEnv);

  const analyst = mapAdminSsoClaimsToActor(
    {
      email: 'analyst@example.com',
      role: ['research']
    },
    config
  );
  const admin = mapAdminSsoClaimsToActor(
    {
      email: 'admin@example.com',
      role: ['platform-admin']
    },
    config
  );
  const fallback = mapAdminSsoClaimsToActor(
    {
      email: 'viewer@example.com',
      role: ['unknown-role']
    },
    config
  );

  assert.deepEqual(analyst, {
    identifier: 'analyst@example.com',
    role: 'ANALYST'
  });
  assert.deepEqual(admin, {
    identifier: 'admin@example.com',
    role: 'ADMIN'
  });
  assert.deepEqual(fallback, {
    identifier: 'viewer@example.com',
    role: 'VIEWER'
  });
});

test('admin sso builds authorization url with pkce and redirect params', async () => {
  const config = getAdminSsoConfig({
    NODE_ENV: 'test',
    APP_BASE_URL: 'https://firm.example.com',
    ADMIN_OIDC_CLIENT_ID: 'client-id',
    ADMIN_OIDC_CLIENT_SECRET: 'client-secret',
    ADMIN_OIDC_AUTHORIZATION_ENDPOINT: 'https://id.example.com/authorize',
    ADMIN_OIDC_TOKEN_ENDPOINT: 'https://id.example.com/token',
    ADMIN_OIDC_USERINFO_ENDPOINT: 'https://id.example.com/userinfo'
  } as NodeJS.ProcessEnv);

  const url = new URL(
    await buildAdminSsoAuthorizationUrl(config, {
      state: 'state-token',
      verifier: 'verifier-token'
    })
  );

  assert.equal(url.origin, 'https://id.example.com');
  assert.equal(url.pathname, '/authorize');
  assert.equal(url.searchParams.get('client_id'), 'client-id');
  assert.equal(url.searchParams.get('redirect_uri'), 'https://firm.example.com/api/admin/sso/callback');
  assert.equal(url.searchParams.get('state'), 'state-token');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
});
