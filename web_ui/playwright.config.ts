import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 15000,
  globalTimeout: 10 * 60 * 1000,
  expect: {
    timeout: 3000,
  },
  use: {
    baseURL: process.env['PLAYWRIGHT_BASE_URL'] ?? 'http://localhost:4200',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    actionTimeout: 5000,
    navigationTimeout: 10000,
    launchOptions: {
      slowMo: 0,
    },
  },
  webServer: {
    command: 'echo "Using existing dev server at $PLAYWRIGHT_BASE_URL"',
    url: process.env['PLAYWRIGHT_BASE_URL'] ?? 'http://localhost:4200',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
