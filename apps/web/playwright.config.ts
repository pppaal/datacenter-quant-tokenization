import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.PORT ?? 3100);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`;

function resolveAdminBasicAuthHeader() {
  const legacyUser = process.env.ADMIN_BASIC_AUTH_USER?.trim();
  const legacyPassword = process.env.ADMIN_BASIC_AUTH_PASSWORD?.trim();

  if (legacyUser && legacyPassword) {
    return `Basic ${Buffer.from(`${legacyUser}:${legacyPassword}`).toString('base64')}`;
  }

  const adminCredentialEntry = process.env.ADMIN_BASIC_AUTH_ADMIN_CREDENTIALS?.split(',')
    .map((entry) => entry.trim())
    .find(Boolean);

  if (!adminCredentialEntry) {
    return undefined;
  }

  const separatorIndex = adminCredentialEntry.indexOf(':');
  if (separatorIndex <= 0 || separatorIndex === adminCredentialEntry.length - 1) {
    return undefined;
  }

  return `Basic ${Buffer.from(adminCredentialEntry).toString('base64')}`;
}

const authorizationHeader = resolveAdminBasicAuthHeader();

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: {
    timeout: 10_000
  },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    extraHTTPHeaders: authorizationHeader
      ? {
          Authorization: authorizationHeader
        }
      : undefined,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],
  webServer: {
    command: `npm run dev -- --hostname 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000
  }
});
