import { expect, test } from '@playwright/test';

test.describe('operator mutation flows', () => {
  test.describe.configure({ mode: 'serial' });

  test('review queue supports reject and approve decisions', async ({ page }) => {
    await page.goto('/admin/review');

    const pendingItems = page.locator('[data-testid="review-item"]').filter({ hasText: 'PENDING' });
    await expect(pendingItems.nth(0)).toBeVisible({ timeout: 20_000 });
    await expect(pendingItems.nth(1)).toBeVisible({ timeout: 20_000 });
    const pendingBeforeReject = await pendingItems.count();

    const rejectItem = pendingItems.nth(0);
    await rejectItem.getByTestId('review-notes').fill('Rejected in mutation E2E for queue coverage.');
    await rejectItem.getByTestId('review-reject').click();
    await expect(page.locator('[data-testid="review-item"]').filter({ hasText: 'PENDING' })).toHaveCount(
      pendingBeforeReject - 1
    );
    await expect(page.getByTestId('review-status').filter({ hasText: 'REJECTED' }).first()).toBeVisible();

    const approveItem = page.locator('[data-testid="review-item"]').filter({ hasText: 'PENDING' }).nth(0);
    const pendingBeforeApprove = await page.locator('[data-testid="review-item"]').filter({ hasText: 'PENDING' }).count();
    await approveItem.getByTestId('review-notes').fill('Approved in mutation E2E for committee-ready coverage.');
    await approveItem.getByTestId('review-approve').click();
    await expect(page.locator('[data-testid="review-item"]').filter({ hasText: 'PENDING' })).toHaveCount(
      pendingBeforeApprove - 1
    );
    await expect(page.getByTestId('review-status').filter({ hasText: 'APPROVED' }).first()).toBeVisible();
  });

  test('asset dossier supports valuation rerun, document upload, and readiness actions', async ({ page }) => {
    const runLabel = `E2E mutation run ${Date.now()}`;
    const uploadTitle = `E2E diligence upload ${Date.now()}`;

    await page.goto('/admin/assets');
    await page.getByRole('link', { name: /Yeouido Core Office Tower/i }).click();

    await page.getByTestId('valuation-run-label').fill(runLabel);
    await page.getByTestId('valuation-run-submit').click();
    await expect(page.getByTestId('latest-run-label')).toContainText(runLabel, { timeout: 30_000 });

    await page.getByTestId('document-title').fill(uploadTitle);
    await page.getByTestId('document-file').setInputFiles({
      name: 'e2e-diligence-note.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Mutation E2E diligence note for deterministic upload coverage.')
    });
    await page.getByTestId('document-upload-submit').click();
    await expect(page.getByTestId('document-history')).toContainText(uploadTitle, { timeout: 30_000 });

    await page.getByTestId('readiness-stage').click();
    await expect(page.getByTestId('readiness-packet')).not.toHaveText('Not staged', { timeout: 30_000 });

    await page.getByTestId('readiness-register').click();
    await expect(page.getByTestId('readiness-latest-tx')).not.toHaveText('No onchain transaction yet', { timeout: 30_000 });

    await page.getByTestId('readiness-anchor').click();
    await expect(page.getByTestId('readiness-status')).toHaveText('ANCHORED', { timeout: 30_000 });
  });

  test('deal console supports archive and restore safely', async ({ page }) => {
    await page.goto('/admin/deals');
    await page.getByTestId('deal-open-link').first().click();

    await expect(page.getByTestId('deal-current-status')).not.toHaveText('ARCHIVED');

    await page.getByTestId('deal-archive-button').click();
    await expect(page.getByTestId('deal-current-status')).toHaveText('ARCHIVED', { timeout: 20_000 });

    await page.getByTestId('deal-restore-button').click();
    await expect(page.getByTestId('deal-current-status')).not.toHaveText('ARCHIVED', { timeout: 20_000 });
  });
});
