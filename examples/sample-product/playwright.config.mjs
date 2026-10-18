import { defineConfig, devices } from '@playwright/test';
import { loadE2eEnv } from '@ads/e2e-kit';

// Needs `ads-e2e up` first (identity + mocks). The product server is started by Playwright with
// the env vars the kit prints, against its own PostgreSQL database.
const CLIENT_ID = 'sample-web';
const PORT = Number(process.env.SAMPLE_PORT ?? 4100);
const BASE_URL = `http://localhost:${PORT}`;
const kit = loadE2eEnv({ clientId: CLIENT_ID });
const productDb = process.env.PRODUCT_DATABASE_URL;
if (!productDb) throw new Error('PRODUCT_DATABASE_URL is required (the sample product database)');

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.mjs',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  workers: process.env.CI ? 2 : 3,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: BASE_URL, trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop-en', use: { ...devices['Desktop Chrome'], locale: 'en-US' } },
    { name: 'mobile-fr', use: { ...devices['Desktop Chrome'], viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, locale: 'fr-FR' } },
  ],
  webServer: {
    command: 'node src/migrate.mjs && node src/server.mjs',
    url: `${BASE_URL}/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    env: { ...kit, DATABASE_URL: productDb, PORT: String(PORT), PUBLIC_URL: BASE_URL, PAYMENTS_MODE: 'mock', PAYMENT_TIMEOUT_SECONDS: '3' },
  },
});
