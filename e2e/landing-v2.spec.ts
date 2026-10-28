import { test, expect, isolatedContext } from './fixture';

test('landing keeps its public paths visible without JavaScript', async ({
  browser,
}, testInfo) => {
  const context = await isolatedContext(browser, testInfo, {
    javaScriptEnabled: false,
    viewport: { width: 320, height: 800 },
  });
  try {
    const page = await context.newPage();
    await page.goto('/');
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to main content' });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('main')).toBeFocused();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'Work moves forward.',
    );
    await expect(
      page
        .getByRole('main')
        .getByRole('link', { name: 'Explore the public playground' })
        .first(),
    ).toHaveAttribute('href', 'https://happyloa.github.io/collab-edge/');
    await expect(
      page.getByRole('link', { name: 'Source and architecture' }),
    ).toBeVisible();
    await expect(
      page.getByText(/private app requires authorized Cloudflare Access/),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(320);
  } finally {
    await context.close();
  }
});

test('landing fits small screens in both languages and themes', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    for (const locale of ['en', 'zh-TW']) {
      await page
        .getByRole('combobox', { name: 'Language / 語言' })
        .selectOption(locale);
      await expect(page.locator('.skip-link')).toHaveText(
        locale === 'en' ? 'Skip to main content' : '跳至主要內容',
      );
      for (const theme of ['light', 'dark']) {
        await page.evaluate((value) => {
          document.documentElement.dataset.theme = value;
        }, theme);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
          `${width}/${locale}/${theme}`,
        ).toBeLessThanOrEqual(width);
      }
    }
  }
});
