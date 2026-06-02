import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.PORT ?? 3100);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`;
const useExternalBaseUrl = Boolean(process.env.PLAYWRIGHT_BASE_URL);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  // Serialize in CI: the two spec files otherwise run on separate workers and
  // hammer the single `next start` server concurrently, which slows the
  // post-mutation router.refresh() repaint enough to flake assertions that wait
  // on freshly mutated state. One worker keeps the server responsive.
  workers: process.env.CI ? 1 : undefined,
  retries: process.env.CI ? 2 : 0,
  timeout: 60_000,
  expect: {
    timeout: 10_000
  },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],
  webServer: useExternalBaseUrl
    ? undefined
    : {
        // Serve the pre-built production app (run-e2e-smoke runs `next build`
        // first). next start serves pre-compiled routes instantly, so the suite
        // is not subject to next-dev on-demand per-route compilation latency
        // (which intermittently exceeded the assertion timeout under CI).
        command: `npm run start -- --hostname 127.0.0.1 --port ${port}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000
      }
});
