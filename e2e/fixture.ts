import { createHash, randomUUID } from 'node:crypto';
import {
  test as base,
  expect,
  type Browser,
  type BrowserContext,
  type Page,
  type TestInfo,
} from '@playwright/test';

// Local workerd sends every browser through one loopback IP. Keep the
// production-sized per-IP limit while giving each independent scenario an IP.
const runId = randomUUID();
function scenarioIp(testInfo: TestInfo) {
  const digest = createHash('sha256')
    .update(`${runId}:${testInfo.testId}:${testInfo.retry}`)
    .digest();
  return `10.${digest[0]}.${digest[1]}.${digest[2]}`;
}

export const test = base.extend<{ rateLimitIdentity: void }>({
  rateLimitIdentity: [
    async ({ context }, use, testInfo) => {
      await context.setExtraHTTPHeaders({
        'CF-Connecting-IP': scenarioIp(testInfo),
      });
      await use();
    },
    { auto: true },
  ],
});

export { expect };

/** Chooses a language in the header's two-way switch. */
export async function setLanguage(page: Page, locale: string) {
  await page
    .getByRole('radiogroup', { name: 'Language / 語言' })
    .getByRole('radio', { name: locale === 'zh-TW' ? '繁體中文' : 'English' })
    .check();
}

export function isolatedContext(
  browser: Browser,
  testInfo: TestInfo,
  options: Parameters<Browser['newContext']>[0] = {},
): Promise<BrowserContext> {
  return browser.newContext({
    ...options,
    extraHTTPHeaders: {
      ...options?.extraHTTPHeaders,
      'CF-Connecting-IP': scenarioIp(testInfo),
    },
  });
}
