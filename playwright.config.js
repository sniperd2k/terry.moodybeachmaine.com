import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: process.env.TERRY_BASE_URL || 'http://127.0.0.1:4177',
    trace: 'off',
  },
  webServer: process.env.TERRY_BASE_URL
    ? undefined
    : {
        command: 'npx --yes serve -l 4177 .',
        url: 'http://127.0.0.1:4177',
        reuseExistingServer: true,
        timeout: 120000,
      },
  projects: [
    {
      name: 'chromium-desktop',
      use: {
        browserName: 'chromium',
        viewport: { width: 1280, height: 720 },
        hasTouch: false,
        isMobile: false,
      },
    },
    {
      name: 'mobile',
      use: {
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
        deviceScaleFactor: 2,
        userAgent: devices['iPhone 12'].userAgent,
      },
    },
  ],
});
