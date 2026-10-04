import { defineConfig, devices } from '@playwright/test';

/**
 * The whole product in a browser: the API on :4000 and the web app on :3000,
 * against a real database. Locally the running dev servers are used; in CI
 * both are started from their production builds.
 */
const CI = !!process.env.CI;

// Lets a test cut off the service worker's network too (offline.spec.ts);
// without it, going "offline" would still let the worker fetch.
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: CI ? 2 : 3,
  retries: 0,
  forbidOnly: CI,
  reporter: CI ? [['list'], ['html', { open: 'never' }], ['github']] : [['list']],
  use: {
    baseURL: process.env.E2E_WEB_URL ?? 'http://localhost:3000',
    locale: 'en-US',
    timezoneId: 'Africa/Cairo',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node dist/main.js',
      cwd: '../api',
      url: 'http://localhost:4000/api/health',
      // The background sweeps (reminders, reports, purges) stay off.
      env: { ...(process.env as Record<string, string>), NODE_ENV: 'test' },
      reuseExistingServer: !CI,
      timeout: 120_000,
      stdout: 'pipe',
    },
    {
      command: 'pnpm start',
      cwd: '../web',
      url: 'http://localhost:3000/login',
      reuseExistingServer: !CI,
      timeout: 120_000,
    },
  ],
});
