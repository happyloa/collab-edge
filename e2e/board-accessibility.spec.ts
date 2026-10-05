import { test, expect } from './fixture';

for (const mode of [
  { width: 1280, height: 720, reducedMotion: 'no-preference' as const },
  { width: 390, height: 844, reducedMotion: 'reduce' as const },
]) {
  test(`card dialog preserves keyboard focus and unsaved edits at ${mode.width}px with ${mode.reducedMotion}`, async ({
    page,
  }) => {
    const failures: string[] = [];
    page.on('pageerror', (error) => failures.push(error.message));
    await page.setViewportSize({ width: mode.width, height: mode.height });
    await page.emulateMedia({ reducedMotion: mode.reducedMotion });
    await page.goto('/');
    await page.getByRole('button', { name: 'Try as Alice' }).click();
    await expect(
      page.getByRole('status', { name: 'Connection status' }),
    ).toHaveText('Connected');
    const title = `Keyboard review ${crypto.randomUUID().slice(0, 8)}`;
    await page.getByLabel('New card in Backlog').fill(title);
    await page
      .getByRole('region', { name: 'Backlog', exact: true })
      .getByRole('button', { name: 'Add card', exact: true })
      .click();
    const opener = page.getByRole('button', { name: title, exact: true });
    await expect(opener).toBeVisible();
    await opener.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'CARD DETAILS' });
    const close = dialog.getByRole('button', { name: 'Close card' });
    await expect(dialog).toBeVisible();
    await expect(close).toBeFocused();
    await expect(dialog).toHaveCSS(
      'animation-name',
      mode.reducedMotion === 'reduce' ? 'none' : 'motion-dialog-in',
    );
    await page.keyboard.press('Shift+Tab');
    expect(
      await dialog.evaluate((element) =>
        element.contains(document.activeElement),
      ),
    ).toBe(true);
    await page.keyboard.press('Tab');
    await expect(close).toBeFocused();
    for (let index = 0; index < 24; index++) {
      await page.keyboard.press('Tab');
      const focus = await dialog.evaluate((element) => ({
        inside: element.contains(document.activeElement),
        tag: document.activeElement?.tagName,
        label: document.activeElement?.getAttribute('aria-label'),
      }));
      expect(focus.inside, `Tab ${index + 1}: ${JSON.stringify(focus)}`).toBe(
        true,
      );
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(mode.width);
    expect(
      await dialog.evaluate((element) => element.scrollWidth),
    ).toBeLessThanOrEqual(
      await dialog.evaluate((element) => element.clientWidth),
    );
    await dialog.getByLabel('Title', { exact: true }).fill(`${title} edited`);
    await page.keyboard.press('Escape');
    await expect(
      dialog.getByRole('button', { name: 'Continue editing' }),
    ).toBeVisible();
    await dialog.getByRole('button', { name: 'Continue editing' }).click();
    await expect(dialog.getByLabel('Title', { exact: true })).toHaveValue(
      `${title} edited`,
    );
    await page.keyboard.press('Escape');
    await dialog.getByRole('button', { name: 'Discard and close' }).click();
    await expect(dialog).not.toBeVisible();
    await expect(opener).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(dialog.getByLabel('Title', { exact: true })).toHaveValue(
      title,
    );
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(opener).toBeFocused();
    await page.getByRole('button', { name: 'Activity', exact: true }).click();
    const activity = page.getByRole('region', { name: 'Recent activity' });
    await expect(activity).toBeVisible();
    await expect(activity.getByRole('listitem').first()).toContainText(
      'card · create',
    );
    await page.getByRole('button', { name: 'Activity', exact: true }).click();
    await expect(activity).not.toBeVisible();
    await opener.focus();
    await page.keyboard.press('Enter');
    await dialog
      .getByRole('button', { name: 'Archive card', exact: true })
      .click();
    await dialog
      .getByRole('button', { name: 'Confirm archive card', exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    await expect(opener).not.toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Website Launch', exact: true }),
    ).toBeFocused();
    expect(failures).toEqual([]);
  });
}
