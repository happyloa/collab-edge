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
  for (const width of [320, 375, 390, 768, 1024, 1280, 1440, 1920]) {
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

test('landing remains operable with forced colors and 200% zoom', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'Toggle color theme' }),
  ).toBeEnabled();
  await page.evaluate(() => {
    document.documentElement.style.zoom = '200%';
  });
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to main content' });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  expect(
    await skip.evaluate((element) => getComputedStyle(element).outlineStyle),
  ).not.toBe('none');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('main')).toBeFocused();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
});

test('product preview uses demo board titles in both languages', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const preview = page.getByRole('region', { name: 'Product preview' });
  const changePath = page.getByRole('list', { name: 'Path of a change' });
  await expect(changePath.getByRole('listitem')).toHaveCount(4);
  for (const step of [
    'Command',
    'Validate and commit',
    'Ordered event',
    'Authorized peers',
  ])
    await expect(changePath.getByText(step, { exact: true })).toBeVisible();
  await expect(
    preview.getByText('Draft the launch announcement'),
  ).toBeVisible();
  await expect(preview.getByText('Build the new home page')).toBeVisible();
  await expect(
    preview.getByText('Review keyboard accessibility'),
  ).toBeVisible();
  await page
    .getByRole('combobox', { name: 'Language / 語言' })
    .selectOption('zh-TW');
  await expect(page.getByText('草擬上線公告')).toBeVisible();
  await expect(page.getByText('製作新版首頁')).toBeVisible();
  await expect(page.getByText('檢查鍵盤無障礙操作')).toBeVisible();
  await expect(page.getByRole('list', { name: '變更的流程' })).toBeVisible();
});
