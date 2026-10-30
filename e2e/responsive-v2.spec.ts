import { test, expect } from './fixture';
import { translate, type Locale } from '../src/i18n/messages';

test('account screens fit the requested widths in both languages and themes', async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of [320, 375, 390, 768, 1024, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 800 });
    for (const route of ['/login', '/register', '/reset-password']) {
      await page.goto(route);
      const language = page.getByRole('combobox', { name: 'Language / 語言' });
      await expect(language).toBeEnabled();
      for (const locale of ['en', 'zh-TW']) {
        await language.selectOption(locale);
        for (const theme of ['light', 'dark']) {
          await page.evaluate((value) => {
            document.documentElement.dataset.theme = value;
          }, theme);
          await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth),
            `${route}/${width}/${locale}/${theme}`,
          ).toBeLessThanOrEqual(width);
        }
      }
    }
  }
});

test('workspace and board fit the requested widths in both languages and themes', async ({
  page,
  context,
}) => {
  test.setTimeout(120000);
  await page.goto('/register');
  await page.getByLabel('Your name').fill('Responsive tester');
  await page
    .getByLabel('Email address')
    .fill(`responsive-${crypto.randomUUID()}@example.com`);
  await page
    .getByLabel('Password', { exact: true })
    .fill('Responsive-test-password-2026');
  await page
    .getByRole('button', { name: 'Create account', exact: true })
    .click();
  await page
    .getByLabel('New workspace', { exact: true })
    .fill('Responsive team');
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await page.getByLabel('New board', { exact: true }).fill('Responsive board');
  await page.getByRole('button', { name: 'Create board' }).click();
  const boardLink = page.getByRole('link', { name: /Responsive board/ });
  await expect(boardLink).toBeVisible();
  const boardPath = await boardLink.getAttribute('href');
  expect(boardPath).toMatch(/^\/boards\/[0-9a-f-]+$/);
  const board = await context.newPage();
  try {
    await board.goto(boardPath!);
    await expect(
      board.getByRole('status', { name: 'Connection status' }),
    ).toHaveText('Connected');
    for (const width of [320, 375, 390, 768, 1024, 1280, 1440, 1920]) {
      for (const target of [page, board])
        await target.setViewportSize({ width, height: 800 });
      for (const locale of ['en', 'zh-TW'] as Locale[]) {
        for (const target of [page, board])
          await target
            .getByRole('combobox', { name: 'Language / 語言' })
            .selectOption(locale);
        for (const theme of ['light', 'dark']) {
          for (const target of [page, board]) {
            await target.evaluate((value) => {
              document.documentElement.dataset.theme = value;
            }, theme);
            await expect(
              target.getByRole('heading', { level: 1 }),
            ).toBeVisible();
            expect(
              await target.evaluate(() => document.documentElement.scrollWidth),
              `${target === page ? 'workspace' : 'board'}/${width}/${locale}/${theme}`,
            ).toBeLessThanOrEqual(width);
          }
          await expect(
            board.getByRole('region', {
              name: translate(locale, 'Board columns'),
            }),
          ).toBeVisible();
        }
      }
    }
  } finally {
    await board.close();
  }
});
