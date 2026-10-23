import { defineConfig, devices } from '@playwright/test';

// Browser checks of the kit's own hosted pages (the demo persona picker) and of the Playwright helpers.
// Needs PostgreSQL: E2E_KIT_TEST_DATABASE_URL (the schema is dropped and recreated).
export default defineConfig({
  testDir: './test-browser',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { ...devices['Desktop Chrome'], trace: 'retain-on-failure' },
});
