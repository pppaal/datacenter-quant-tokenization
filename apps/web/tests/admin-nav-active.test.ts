import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isAdminNavItemActive } from '@/components/admin/admin-nav';

test("Overview ('/admin') is active ONLY on the exact root, not every sub-route", () => {
  assert.equal(isAdminNavItemActive('/admin', '/admin'), true);
  assert.equal(isAdminNavItemActive('/admin', '/admin/deals'), false);
  assert.equal(isAdminNavItemActive('/admin', '/admin/assets/explorer'), false);
});

test('section items highlight their own route and nested routes', () => {
  assert.equal(isAdminNavItemActive('/admin/deals', '/admin/deals'), true);
  assert.equal(isAdminNavItemActive('/admin/deals', '/admin/deals/abc'), true);
  assert.equal(isAdminNavItemActive('/admin/deals', '/admin/assets'), false);
  // Sibling-prefix must not false-match (e.g. /admin/deals vs /admin/deals-x).
  assert.equal(isAdminNavItemActive('/admin/deals', '/admin/deals-archive'), false);
});
