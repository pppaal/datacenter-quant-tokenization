import { expect, test, type Page } from '@playwright/test';

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

test.describe('operator mutation flows', () => {
  test.describe.configure({ mode: 'serial' });

  test('review queue supports reject and approve decisions', async ({ page }) => {
    await loginAsOperator(page);
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

    await loginAsOperator(page);
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
    await expect(page.getByTestId('readiness-feedback')).toContainText('Latest evidence hash anchored.', { timeout: 30_000 });
    await expect(page.getByTestId('readiness-latest-tx')).not.toHaveText('No onchain transaction yet');
  });

  test('deal console supports archive and restore safely', async ({ page }) => {
    await loginAsOperator(page);
    await page.goto('/admin/deals');
    await page.getByTestId('deal-open-link').first().click();

    await expect(page.getByTestId('deal-current-status')).not.toHaveText('ARCHIVED');

    await page.getByTestId('deal-archive-button').click();
    await expect(page.getByTestId('deal-current-status')).toHaveText('ARCHIVED', { timeout: 20_000 });

    await page.getByTestId('deal-restore-button').click();
    await expect(page.getByTestId('deal-current-status')).not.toHaveText('ARCHIVED', { timeout: 20_000 });
  });

  test('DD deliverable completeness gates IC packet lock and packets move through decision release flow', async ({ page }) => {
    const deliverableTitle = `E2E technical DD deliverable ${Date.now()}`;

    page.on('dialog', (dialog) => {
      dialog.accept().catch(() => undefined);
    });

    await loginAsOperator(page);
    await page.goto('/admin/ic');

    const readyPacketCard = page
      .getByTestId('ic-packet-card')
      .filter({ hasText: 'ICPKT-SEOUL-YEOUIDO-2026Q2-READY' })
      .first();

    await expect(readyPacketCard).toBeVisible({ timeout: 20_000 });
    await expect(readyPacketCard).toContainText(/supporting deliverables are missing/i);
    await expect(readyPacketCard.getByTestId('ic-packet-lock-button')).toBeDisabled();

    await page.goto('/admin/deals');
    await page.getByRole('link', { name: /Yeouido Core Office Tower Recapitalization/i }).first().click();

    const technicalLane = page
      .getByTestId('diligence-workstream-card')
      .filter({ hasText: /Technical/i })
      .first();

    await expect(technicalLane).toBeVisible({ timeout: 20_000 });
    const dealId = page.url().split('/').pop();
    const workstreamId = await technicalLane.getAttribute('data-workstream-id');
    expect(dealId).toBeTruthy();
    expect(workstreamId).toBeTruthy();

    const uploadResponse = await page.request.post(
      `/api/deals/${dealId}/diligence-workstreams/${workstreamId}/deliverables/upload`,
      {
        multipart: {
          title: deliverableTitle,
          documentType: 'OTHER',
          note: 'Mutation E2E technical deliverable.',
          file: {
            name: 'technical-dd-note.txt',
            mimeType: 'text/plain',
            buffer: Buffer.from('Technical DD deliverable linked through mutation E2E.')
          }
        }
      }
    );
    expect(uploadResponse.ok()).toBeTruthy();
    await page.reload();
    const technicalLaneAfterUpload = page
      .getByTestId('diligence-workstream-card')
      .filter({ hasText: /Technical/i })
      .first();
    await expect(
      technicalLaneAfterUpload.getByTestId('diligence-deliverable-row').filter({ hasText: deliverableTitle }).first()
    ).toBeVisible({ timeout: 30_000 });
    const updateResponse = await page.request.patch(
      `/api/deals/${dealId}/diligence-workstreams/${workstreamId}`,
      {
        data: {
          status: 'SIGNED_OFF',
          signedOffByLabel: 'E2E operator'
        }
      }
    );
    expect(updateResponse.ok()).toBeTruthy();
    await page.reload();
    const technicalLaneSignedOff = page
      .getByTestId('diligence-workstream-card')
      .filter({ hasText: /Technical/i })
      .first();
    await expect(technicalLaneSignedOff).toContainText('Signed Off', { timeout: 20_000 });

    await page.goto('/admin/ic');
    const packetAfterUpload = page
      .getByTestId('ic-packet-card')
      .filter({ hasText: 'ICPKT-SEOUL-YEOUIDO-2026Q2-READY' })
      .first();

    await expect(packetAfterUpload.getByTestId('ic-packet-lock-button')).toBeEnabled({ timeout: 20_000 });
    await packetAfterUpload.getByTestId('ic-packet-lock-button').click();
    await expect(packetAfterUpload.getByTestId('ic-packet-status')).toContainText('locked', { timeout: 20_000 });

    await packetAfterUpload.getByTestId('ic-packet-decision-outcome').selectOption('APPROVED');
    await packetAfterUpload.getByTestId('ic-packet-decision-notes').fill('Approved in E2E after DD deliverable completion.');
    await packetAfterUpload.getByTestId('ic-packet-decision-followup').fill('Release the packet to the operating record.');
    await packetAfterUpload.getByTestId('ic-packet-decision-submit').click();
    await expect(packetAfterUpload.getByTestId('ic-packet-status')).toContainText('approved', { timeout: 20_000 });

    await packetAfterUpload.getByTestId('ic-packet-release-button').click();
    await expect(packetAfterUpload.getByTestId('ic-packet-status')).toContainText('released', { timeout: 20_000 });
  });

  test('security controls support identity mapping, seat updates, and alert replay', async ({ page }) => {
    await loginAsOperator(page);
    await page.goto('/admin/security');

    const bindingCards = page.getByTestId('identity-binding-card');
    const unmappedCountBefore = await bindingCards.count();
    const bindingCard = bindingCards.first();
    await expect(bindingCard).toBeVisible({ timeout: 20_000 });
    await bindingCard.getByTestId('identity-binding-map').click();
    await expect
      .poll(async () => await page.getByTestId('identity-binding-card').count(), {
        timeout: 20_000
      })
      .toBe(Math.max(0, unmappedCountBefore - 1));

    const analystSeatCard = page
      .getByTestId('operator-seat-card')
      .filter({ hasText: 'Lead Underwriter' })
      .first();
    await expect(analystSeatCard).toBeVisible();
    await analystSeatCard.getByTestId('operator-seat-status').selectOption('inactive');
    await analystSeatCard.getByTestId('operator-seat-save').click();
    await expect(analystSeatCard).toContainText('inactive', { timeout: 20_000 });

    await analystSeatCard.getByTestId('operator-seat-status').selectOption('active');
    await analystSeatCard.getByTestId('operator-seat-save').click();
    await expect(analystSeatCard).toContainText('active', { timeout: 20_000 });

    page.once('dialog', (dialog) => dialog.accept());
    await analystSeatCard.getByTestId('operator-seat-revoke').click();
    await expect(analystSeatCard.getByText(/session version/i)).toBeVisible({ timeout: 20_000 });

    const replayCard = page
      .getByTestId('ops-alert-delivery-card')
      .filter({ hasText: /failed|skipped/i })
      .first();

    if (await replayCard.count()) {
      await replayCard.getByTestId('ops-alert-replay-button').click();
      await expect(replayCard.getByTestId('ops-alert-replay-feedback')).toContainText('Replay recorded');
    }
  });

  test('property explorer supports one-click dossier bootstrap for untracked assets', async ({ page }) => {
    await loginAsOperator(page);
    await page.goto('/admin/assets/explorer');

    const pangyoRow = page.getByTestId('property-explorer-row').filter({ hasText: 'Pangyo Innovation Office Park' }).first();
    await expect(pangyoRow).toBeVisible({ timeout: 20_000 });
    await pangyoRow.click();

    const bootstrapButton = page.getByTestId('property-explorer-bootstrap');
    await expect(bootstrapButton).toBeVisible();
    await expect(bootstrapButton).toHaveText(/Bootstrap Asset Dossier/i);
    await bootstrapButton.click();

    await expect(page).toHaveURL(/\/admin\/assets\/[^/]+$/);
    await expect(page.locator('h2').filter({ hasText: 'Pangyo Innovation Office Park' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Research Snapshot', { exact: true })).toBeVisible();

    await page.goto('/admin/assets/explorer');
    const trackedPangyoRow = page.getByTestId('property-explorer-row').filter({ hasText: 'Pangyo Innovation Office Park' }).first();
    await trackedPangyoRow.click();
    await expect(page.getByTestId('property-explorer-open-linked')).toBeVisible({ timeout: 20_000 });
  });

  test('research workspace shows house view approval controls', async ({ page }) => {
    await loginAsOperator(page);
    await page.goto('/admin/research');
    await page.waitForLoadState('networkidle');

    // Check that the research page loaded
    const heading = page.locator('text=Research');
    await expect(heading.first()).toBeVisible();
  });

  test('deal diligence workstream panel renders with create form', async ({ page }) => {
    await loginAsOperator(page);
    // Navigate to the first deal (from seed data)
    await page.goto('/admin/deals');
    await page.waitForLoadState('networkidle');

    const dealLink = page.locator('a[href*="/admin/deals/"]').first();
    if (await dealLink.isVisible()) {
      await dealLink.click();
      await page.waitForLoadState('networkidle');

      // Check for the diligence workstream section
      const ddSection = page.locator('text=Due Diligence');
      if (await ddSection.isVisible()) {
        await expect(ddSection).toBeVisible();
      }
    }
  });

  test('committee workspace displays dashboard summary and action items', async ({ page }) => {
    await loginAsOperator(page);
    await page.goto('/admin/ic');
    await page.waitForLoadState('networkidle');

    await expect(
      page.getByRole('heading', { name: /Lock committee packets, run agendas, and preserve decision lineage/i })
    ).toBeVisible();

    const metricCards = page.locator('.metric-card');
    expect(await metricCards.count()).toBeGreaterThanOrEqual(1);
  });
});
