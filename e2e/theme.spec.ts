import { test, expect } from '@playwright/test';

for (const scheme of ['dark', 'light'] as const) {
  test(`theme follows ${scheme} preference before hydration and toggles once`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/');
    const toggle = page.getByRole('button', { name: 'Toggle color theme' });
    const target = scheme === 'dark' ? 'light' : 'dark';
    await expect(toggle.locator(`.theme-icon-${target}`)).toBeVisible();
    await toggle.click();
    await expect(page.locator('html')).toHaveCSS('color-scheme', target);
    await expect(toggle.locator(`.theme-icon-${scheme}`)).toBeVisible();
    await page.emulateMedia({ colorScheme: target });
    await expect(page.locator('html')).toHaveCSS('color-scheme', target);
    await toggle.click();
    await expect(page.locator('html')).toHaveCSS('color-scheme', scheme);
  });
}

test('system theme changes update icons without JavaScript', async ({
  browser,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    colorScheme: 'dark',
  });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.locator('.theme-icon-light')).toBeVisible();
  await expect(page.locator('.theme-icon-dark')).toBeHidden();
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('.theme-icon-dark')).toBeVisible();
  await expect(page.locator('.theme-icon-light')).toBeHidden();
  await context.close();
});
