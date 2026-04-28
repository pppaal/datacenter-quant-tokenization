import assert from 'node:assert/strict';
import test from 'node:test';
import {
  authorizeAdminCredentials,
  getAdminAuthConfig,
  getRequiredAdminRoleForPath,
  isAdminAuthorized
} from '@/lib/security/admin-auth';

test('admin auth config is disabled when both credentials are missing', () => {
  const config = getAdminAuthConfig({ NODE_ENV: 'test' });
  assert.equal(config.mode, 'disabled');
});

test('admin auth config is misconfigured when only one credential is present', () => {
  const config = getAdminAuthConfig({ NODE_ENV: 'test', ADMIN_BASIC_AUTH_USER: 'admin' });
  assert.equal(config.mode, 'misconfigured');
});

test('admin auth accepts a valid basic auth header', () => {
  const config = getAdminAuthConfig({
    NODE_ENV: 'test',
    ADMIN_BASIC_AUTH_USER: 'admin',
    ADMIN_BASIC_AUTH_PASSWORD: 'secret'
  });
  const header = `Basic ${Buffer.from('admin:secret').toString('base64')}`;

  assert.equal(isAdminAuthorized(header, config), true);
  assert.equal(
    isAdminAuthorized(`Basic ${Buffer.from('admin:wrong').toString('base64')}`, config),
    false
  );
});

test('admin auth accepts valid credentials without a basic auth header', () => {
  const config = getAdminAuthConfig({
    NODE_ENV: 'test',
    ADMIN_BASIC_AUTH_VIEWER_CREDENTIALS: 'viewer:pw1',
    ADMIN_BASIC_AUTH_ANALYST_CREDENTIALS: 'analyst:pw2'
  });

  assert.deepEqual(authorizeAdminCredentials('analyst', 'pw2', config), {
    identifier: 'analyst',
    role: 'ANALYST',
    provider: 'basic',
    email: null
  });
  assert.equal(authorizeAdminCredentials('analyst', 'bad', config), null);
});

test('admin role matrix protects analyst and admin routes', () => {
  assert.equal(getRequiredAdminRoleForPath('/admin'), 'VIEWER');
  assert.equal(getRequiredAdminRoleForPath('/admin/assets'), 'VIEWER');
  assert.equal(getRequiredAdminRoleForPath('/admin/research'), 'ANALYST');
  assert.equal(getRequiredAdminRoleForPath('/admin/deals/abc'), 'ANALYST');
  assert.equal(getRequiredAdminRoleForPath('/admin/portfolio/abc'), 'ANALYST');
  assert.equal(getRequiredAdminRoleForPath('/admin/security'), 'ADMIN');
  assert.equal(getRequiredAdminRoleForPath('/api/admin/operators'), 'ADMIN');
  assert.equal(getRequiredAdminRoleForPath('/api/admin/ops-alert-deliveries/replay'), 'ADMIN');
  assert.equal(getRequiredAdminRoleForPath('/api/admin/ops-work-items/work_1/replay'), 'ADMIN');
  assert.equal(getRequiredAdminRoleForPath('/api/deals'), 'ANALYST');
  assert.equal(getRequiredAdminRoleForPath('/api/readiness'), 'ADMIN');
});
