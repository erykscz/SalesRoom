import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E test configuration for SalesRoom frontend.
 *
 * Launches both backend (Express on port 3001) and frontend (Vite on port 5173)
 * before running tests.
 */
export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  retries: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'dot' : 'html',

  use: {
    baseURL: 'http://localhost:5173',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'Desktop Chrome',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: [
    {
      command: 'cd ../backend && npm start',
      port: 3001,
      reuseExistingServer: !process.env.CI,
      timeout: process.env.CI ? 60_000 : 30_000,
    },
    {
      command: 'npm run dev',
      port: 5173,
      reuseExistingServer: !process.env.CI,
      timeout: process.env.CI ? 60_000 : 30_000,
    },
  ],
});
