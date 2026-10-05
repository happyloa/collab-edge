import { defineConfig } from 'vitest/config';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
export default defineConfig({
  plugins: [
    cloudflareTest({
      main: './tests/worker.ts',
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations('./drizzle'),
          SESSION_SECRET: 'test-only-secret-at-least-32-characters-long',
          SESSION_SIGNING_KEY: 'independent-session-signing-key-for-tests-only',
          PASSWORD_PEPPERS: JSON.stringify({
            p1: 'independent-password-pepper-for-tests-only',
          }),
          ATTACHMENTS_ENABLED: 'true',
          ACCESS_REQUIRED: 'false',
        },
      },
    }),
  ],
  test: {
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 20000,
  },
});
