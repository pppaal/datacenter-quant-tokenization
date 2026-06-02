import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

/**
 * Shared helpers for the operator browser E2E specs, kept in one place so the
 * credential resolution, login flow, and navigation behaviour stay identical
 * across operator-smoke and operator-mutation (they were previously copy-pasted
 * into both files).
 */

function resolveAdminBrowserCredential() {
  const legacyUser = process.env.ADMIN_BASIC_AUTH_USER?.trim();
  const legacyPassword = process.env.ADMIN_BASIC_AUTH_PASSWORD?.trim();

  if (legacyUser && legacyPassword) {
    return {
      user: legacyUser,
      password: legacyPassword
    };
  }

  const adminCredentialEntry =
    process.env.ADMIN_BASIC_AUTH_ADMIN_CREDENTIALS?.split(',')
      .map((entry) => entry.trim())
      .find(Boolean) ?? 'admin@nexusseoul.local:secret';

  const separatorIndex = adminCredentialEntry.indexOf(':');
  if (separatorIndex <= 0 || separatorIndex === adminCredentialEntry.length - 1) {
    throw new Error('ADMIN_BASIC_AUTH_ADMIN_CREDENTIALS must use user:password entries.');
  }

  return {
    user: adminCredentialEntry.slice(0, separatorIndex),
    password: adminCredentialEntry.slice(separatorIndex + 1)
  };
}

export async function loginAsOperator(page: Page) {
  const credentials = resolveAdminBrowserCredential();
  await page.goto('/admin/login');
  await page.locator('#user').fill(credentials.user);
  await page.locator('#password').fill(credentials.password);
  await page.getByRole('button', { name: /start operator session/i }).click();
  await page.waitForURL((url) => !url.pathname.endsWith('/admin/login'), { timeout: 20_000 });
  await expect(page).not.toHaveURL(/\/admin\/login/);
}

/**
 * Follow an in-app <Link> by reading its server-rendered href and navigating
 * directly. A bare .click() triggers a client-side soft navigation that, when
 * fired before the App Router has finished hydrating, is silently swallowed
 * (the RSC request is aborted and the URL never changes) — the root cause of
 * the flaky detail-page assertions in this suite. The href is the link's
 * destination of record, so going to it is deterministic while still proving
 * the link targets the page the operator expects.
 */
export async function openViaLink(page: Page, link: Locator) {
  await expect(link).toBeVisible();
  const href = await link.getAttribute('href');
  expect(href, 'expected the link to expose a navigable href').toBeTruthy();
  await page.goto(href as string);
}
