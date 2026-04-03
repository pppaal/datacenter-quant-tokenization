import { expect, test } from '@playwright/test';

test.describe('seeded operator smoke flows', () => {
  test('asset dossier and report library stay navigable', async ({ page }) => {
    await page.goto('/admin/assets');

    await expect(page.getByRole('heading', { name: /Asset Pipeline/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Yeouido Core Office Tower/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Seoul Hyperscale Campus I/i })).toBeVisible();

    await page.getByRole('link', { name: /Yeouido Core Office Tower/i }).click();
    await expect(page.getByText('Asset Dossier')).toBeVisible();
    await expect(page.getByRole('heading', { name: /Yeouido Core Office Tower/i })).toBeVisible();
    await expect(page.getByText('Approved Feature Layer')).toBeVisible();
    await expect(page.getByText('Research Snapshot')).toBeVisible();
    await expect(page.getByText('Review Readiness')).toBeVisible();

    await page.getByRole('link', { name: /Open Report Library/i }).click();
    await expect(page.getByRole('heading', { name: /Underwriting Reports/i })).toBeVisible();
    await expect(page.getByText('Package Snapshot')).toBeVisible();
    await expect(page.getByText('Approved Evidence')).toBeVisible();
    await expect(page.getByText('Review Packet')).toBeVisible();
  });

  test('review and research workspaces expose seeded coverage', async ({ page }) => {
    await page.goto('/admin/review');

    await expect(page.getByRole('heading', { name: /Normalize, review, and approve evidence/i })).toBeVisible();
    await expect(page.getByText('Global Review Queue')).toBeVisible();
    await expect(page.getByText(/Incheon AI Colocation Campus|Yeouido Core Office Tower|Seoul Hyperscale Campus I/i).first()).toBeVisible();

    await page.goto('/admin/research');
    await expect(page.getByRole('heading', { name: /Official-source research fabric/i })).toBeVisible();
    await expect(page.getByText('Workspace Status')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Macro' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Markets' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Submarkets' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Asset Dossiers' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Coverage' })).toBeVisible();

    await page.getByRole('link', { name: 'Asset Dossiers' }).click();
    await expect(page.getByText('Asset-level research coverage and blockers')).toBeVisible();
    await expect(page.getByRole('link', { name: /Yeouido Core Office Tower/i })).toBeVisible();

    await page.getByRole('link', { name: 'Coverage' }).click();
    await expect(page.getByText('Open research tasks and freshness exceptions')).toBeVisible();
  });

  test('deals, portfolio, and funds shells load seeded operator state', async ({ page }) => {
    await page.goto('/admin/deals');
    await expect(page.getByRole('heading', { name: /Run one real process from first teaser to handoff/i })).toBeVisible();
    await expect(page.getByText('Pipeline state machine')).toBeVisible();
    await expect(page.getByText(/checklist/i).first()).toBeVisible();

    await page.goto('/admin/portfolio');
    await expect(page.getByRole('heading', { name: /Hold performance, covenant watchlists, and exit cases/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Korea Income & Infrastructure Portfolio I/i })).toBeVisible();
    await page.getByRole('link', { name: /Korea Income & Infrastructure Portfolio I/i }).click();
    await expect(page.getByText('Portfolio Command Center')).toBeVisible();
    await expect(page.getByText('AI Operator Brief')).toBeVisible();
    await expect(page.getByText('Lease Rollover Watchlist')).toBeVisible();

    await page.goto('/admin/funds');
    await expect(page.getByRole('heading', { name: /Funds, vehicles, commitments, and reporting shells/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Han River Real Estate Fund I/i })).toBeVisible();
    await page.getByRole('link', { name: /Han River Real Estate Fund I/i }).click();
    await expect(page.getByText('Fund Shell')).toBeVisible();
    await expect(page.getByText('Investor Update Draft')).toBeVisible();
    await expect(page.getByText('Capital Calls And Distributions')).toBeVisible();
  });
});
