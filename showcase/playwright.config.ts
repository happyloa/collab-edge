import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  outputDir: '../showcase-test-results',
  workers: 1,
  use: {
    baseURL: 'http://localhost:4173/collab-edge/',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command:
      'node node_modules/vite/bin/vite.js preview --config showcase/vite.config.ts --port 4173',
    cwd: '..',
    url: 'http://localhost:4173/collab-edge/',
    timeout: 30000,
  },
});
