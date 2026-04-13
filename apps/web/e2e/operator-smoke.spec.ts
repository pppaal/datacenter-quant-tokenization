import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

function resolveAdminBrowserCredential() {
  const legacyUser = process.env.ADMIN_BASIC_AUTH_USER?.trim();
  const legacyPassword = process.env.ADMIN_BASIC_AUTH_PASSWORD?.trim();

  if (legacyUser && legacyPassword) {
    return {
      user: legacyUser,
      password: legacyPassword
    };
  }

  const adminCredentialEntry = process.env.ADMIN_BASIC_AUTH_ADMIN_CREDENTIALS?.split(',')
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

async function loginAsOperator(page: Page) {
  const credentials = resolveAdminBrowserCredential();
  await page.goto('/admin/login');
  await page.locator('#user').fill(credentials.user);
  await page.locator('#password').fill(credentials.password);
  await page.getByRole('button', { name: /start operator session/i }).click();
  await page.waitForURL((url) => !url.pathname.endsWith('/admin/login'), { timeout: 20_000 });
  await expect(page).not.toHaveURL(/\/admin\/login/);
}

test.describe('seeded operator smoke flows', () => {
  test('admin overview and navigation stay connected', async ({ page }) => {
    await loginAsOperator(page);
    await page.goto('/admin');

    await expect(page.getByRole('heading', { name: /Operator surface for a Korean AI-native real-estate investment firm/i })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Deals', exact: true }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Assets', exact: true }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Portfolio', exact: true }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Funds', exact: true }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Research', exact: true }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Review', exact: true }).first()).toBeVisible();

    await page.getByRole('link', { name: 'Research', exact: true }).first().click();
    await expect(page).toHaveURL(/\/admin\/research/);
    await expect(page.getByText('Workspace Status')).toBeVisible();
    await expect(page.getByRole('button', { name: /Run Research Sync/i })).toBeVisible();
  });

  test('asset dossier and report library stay navigable', async ({ page }) => {
    await loginAsOperator(page);
    await page.goto('/admin/assets');

    await expect(page.getByText('Asset Pipeline', { exact: true })).toBeVisible();
    await expect(page.getByText(/Korean real-estate dossiers moving through evidence, valuation, and committee review\./i)).toBeVisible();
    await page.getByRole('link', { name: /Open Property Explorer/i }).click();
    await expect(page).toHaveURL(/\/admin\/assets\/explorer/);
    await expect(page.getByRole('heading', { name: /Click a Korean property screen, run a first-pass investment view/i })).toBeVisible();
    await expect(page.getByTestId('property-explorer-marker').first()).toBeVisible();
    await expect(page.getByTestId('property-explorer-row').first()).toBeVisible();

    await page.goto('/admin/assets');
    await expect(page.getByRole('link', { name: /Yeouido Core Office Tower/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Seoul Hyperscale Campus I/i })).toBeVisible();

    await page.getByRole('link', { name: /Yeouido Core Office Tower/i }).click();
    await expect(page.locator('.eyebrow').filter({ hasText: 'Asset Dossier' }).first()).toBeVisible();
    await expect(page.locator('h2').filter({ hasText: 'Yeouido Core Office Tower' })).toBeVisible();
    await expect(page.locator('[data-testid="feature-snapshot-panel"]').getByText('Approved Feature Layer', { exact: true })).toBeVisible();
    await expect(page.getByText('Research Snapshot', { exact: true })).toBeVisible();
    await expect(page.getByText('Review Readiness', { exact: true })).toBeVisible();

    await page.getByRole('link', { name: /Open Report Library/i }).click();
    await expect(page.getByRole('heading', { name: /Underwriting Reports/i })).toBeVisible();
    await expect(page.getByText('Package Snapshot', { exact: true })).toBeVisible();
    await expect(page.getByText('Approved Evidence', { exact: true })).toBeVisible();
    await expect(page.getByText('Review Packet', { exact: true })).toBeVisible();
  });

  test('review and research workspaces expose seeded coverage', async ({ page }) => {
    await loginAsOperator(page);
    await page.goto('/admin/review');

    await expect(page.getByRole('heading', { name: /Normalize, review, and approve evidence/i })).toBeVisible();
    await expect(page.getByText('Global Review Queue')).toBeVisible();
    await expect(page.getByText(/Incheon AI Colocation Campus|Yeouido Core Office Tower|Seoul Hyperscale Campus I/i).first()).toBeVisible();

    await page.goto('/admin/research');
    await expect(page.getByRole('heading', { name: /Official-source research fabric/i })).toBeVisible();
    await expect(page.getByText('Workspace Status')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Macro', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Markets', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Submarkets', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Asset Dossiers', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Optimization Lab', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Coverage', exact: true })).toBeVisible();

    await page.getByRole('link', { name: 'Asset Dossiers', exact: true }).click();
    await expect(page.getByText('Asset-level research coverage and blockers')).toBeVisible();
    await expect(page.getByRole('link', { name: /Yeouido Core Office Tower/i })).toBeVisible();

    await page.getByRole('link', { name: 'Coverage', exact: true }).click();
    await expect(page.getByText('Open research tasks and freshness exceptions')).toBeVisible();

    await page.getByRole('link', { name: 'Optimization Lab', exact: true }).click();
    await expect(page.getByText('Quantum-inspired portfolio search and scenario exploration')).toBeVisible();
  });

  test('deals, portfolio, and funds shells load seeded operator state', async ({ page }) => {
    await loginAsOperator(page);
    await page.goto('/admin/deals');
    await expect(page.getByRole('heading', { name: /Run one real process from first teaser to handoff/i })).toBeVisible();
    await expect(page.getByText('Pipeline state machine')).toBeVisible();
    await expect(page.getByRole('link', { name: /Open/i }).first()).toBeVisible();
    await expect(page.getByText(/checklist/i).first()).toBeVisible();

    await page.goto('/admin/portfolio');
    await expect(page.getByRole('heading', { name: /Hold performance, covenant watchlists, and exit cases/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Korea Income & Infrastructure Portfolio I/i })).toBeVisible();
    await page.getByRole('link', { name: /Korea Income & Infrastructure Portfolio I/i }).click();
    await expect(page.getByText('Portfolio Command Center')).toBeVisible();
    await expect(page.getByText('AI Operator Brief')).toBeVisible();
    await expect(page.getByText('Portfolio Optimization Lab')).toBeVisible();
    await expect(page.getByText('Lease Rollover Watchlist', { exact: true })).toBeVisible();

    await page.goto('/admin/funds');
    await expect(page.getByRole('heading', { name: /Funds, vehicles, commitments, and reporting shells/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Han River Real Estate Fund I/i })).toBeVisible();
    await page.getByRole('link', { name: /Han River Real Estate Fund I/i }).click();
    await expect(page.getByText('Fund Shell')).toBeVisible();
    await expect(page.getByText('Investor Update Draft')).toBeVisible();
    await expect(page.getByText('Capital Calls And Distributions')).toBeVisible();
  });
});
