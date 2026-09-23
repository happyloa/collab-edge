import { test, expect } from '@playwright/test';

test('motion follows user preference without shifting draggable cards', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const hero = page.getByRole('heading', { name: /Good work happens/ });
  await expect(hero).toHaveCSS('animation-name', 'motion-rise');

  const action = page.getByRole('link', { name: 'Get started' });
  await action.hover();
  await expect(action).toHaveCSS('transform', /matrix/);
  const preview = page
    .getByRole('region', { name: 'Product preview' })
    .locator('.interactive-surface')
    .first();
  await preview.hover();
  await expect(preview).toHaveCSS('transform', /matrix/);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(hero).toHaveCSS('animation-name', 'none');
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
