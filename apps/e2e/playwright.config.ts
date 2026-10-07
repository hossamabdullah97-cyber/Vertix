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
      // A fixed test key, so webhooks (which are signed with stored secrets) can be added.
      env: {
        INTEGRATION_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
        // Google Calendar, played by tests/calendar.spec.ts on its own port.
        OAUTH_GOOGLE_CALENDAR_CLIENT_ID: 'e2e-calendar',
        OAUTH_GOOGLE_CALENDAR_CLIENT_SECRET: 'e2e-calendar-secret',
        OAUTH_GOOGLE_CALENDAR_AUTH_URL: 'http://localhost:4106/authorize',
        OAUTH_GOOGLE_CALENDAR_TOKEN_URL: 'http://localhost:4106/token',
        GOOGLE_CALENDAR_API_URL: 'http://localhost:4106',
        // Zapier's hooks, played by tests/zapier.spec.ts.
        ZAPIER_TEST_HOOK_ORIGINS: 'http://localhost:4107/',
        // Expo's push service, played by tests/app-push.spec.ts.
        EXPO_PUSH_URL: 'http://localhost:4108/push/send',
        ...(process.env as Record<string, string>),
        NODE_ENV: 'test',
        AUTH_RATE_LIMIT: '500',
      },
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
