import { defineConfig, devices } from '@playwright/test';
const localPort = Number(process.env.COLLABEDGE_E2E_PORT ?? 3000);
if (!Number.isInteger(localPort) || localPort < 1024 || localPort > 65535)
  throw new Error('Invalid local E2E port');
const localUrl = `http://localhost:${localPort}`;
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? localUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    ...(['firefox', 'webkit'] as const).map((name) => ({
      name,
      testMatch:
        /(?:auth-navigation|board-accessibility|history-maintenance)\.spec\.ts$/,
      use: {
        ...devices[name === 'firefox' ? 'Desktop Firefox' : 'Desktop Safari'],
      },
    })),
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `corepack pnpm dev --port ${localPort}`,
        url: localUrl,
        reuseExistingServer:
          !process.env.CI && !process.env.COLLABEDGE_E2E_STATE_PATH,
        timeout: 120000,
      },
});
