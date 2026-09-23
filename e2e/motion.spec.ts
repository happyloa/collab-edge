import { test, expect } from '@playwright/test';

test('motion follows user preference without shifting draggable cards', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const hero = page.getByRole('heading', { name: /Good work happens/ });
  const ticker = page.locator('[data-ticker-track]');
  await expect(hero).toBeVisible();
  await expect(ticker).toHaveCSS('transform', /matrix/);

  const action = page.getByRole('link', { name: 'Get started' });
  await action.hover();
  await expect(action).toHaveCSS('transform', /matrix/);
  const previewRegion = page.getByRole('region', { name: 'Product preview' });
  await previewRegion.scrollIntoViewIfNeeded();
  await expect(previewRegion).toBeVisible();
  const preview = previewRegion.locator('.interactive-surface').first();
  await preview.hover();
  await expect(preview).toHaveCSS('transform', /matrix/);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(ticker).toHaveCSS('transform', 'none');
  await expect(hero).toBeVisible();
  await expect(action).toHaveCSS('transform', 'none');
  expect(
    await action.evaluate((element) =>
      parseFloat(getComputedStyle(element).transitionDuration),
    ),
  ).toBeLessThan(0.001);

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.getByRole('button', { name: 'Try as Alice' }).click();
  const card = page.getByRole('button', {
    name: 'Map the customer journey',
    exact: true,
  });
  const sortable = card.locator(
    'xpath=ancestor::div[contains(@class, "sortable-surface")]',
  );
  await sortable.hover();
  await expect(sortable).toHaveCSS('transform', 'none');
});

test('scroll reveals finish and home fits a narrow viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');

  const preview = page.getByRole('region', { name: 'Product preview' });
  await preview.scrollIntoViewIfNeeded();
  await expect(preview).toHaveCSS('transform', 'none');
  await page.locator('[data-features]').scrollIntoViewIfNeeded();
  await expect(page.locator('[data-feature]').first()).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(375);
});

test('reduced motion is respected on first paint and after switching language', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('[data-ticker-track]')).toHaveCSS(
    'transform',
    'none',
  );
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Product preview' }),
  ).toBeVisible();

  await page
    .getByRole('combobox', { name: 'Language / 語言' })
    .selectOption('zh-TW');
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-TW');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('[data-ticker-track]')).toHaveCSS(
    'transform',
    'none',
  );
});
