import { test, expect } from './fixture';

test('a card can be positioned without dragging and the move persists', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try as Alice' }).click();
  await expect(
    page.getByRole('status', { name: 'Connection status' }),
  ).toHaveText('Connected');
  const card = 'Map the customer journey';
  await page.getByRole('button', { name: card, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'CARD DETAILS' });
  await dialog
    .getByRole('combobox', { name: 'Move to' })
    .selectOption({ label: 'In Progress' });
  await dialog
    .getByRole('button', { name: 'Choose position in column' })
    .click();
  await expect(
    dialog
      .getByRole('combobox', { name: 'Position', exact: true })
      .getByRole('option', { name: 'Before Build the new home page' }),
  ).toBeAttached();
  await dialog
    .getByRole('combobox', { name: 'Position', exact: true })
    .selectOption({ label: 'Before Build the new home page' });
  await dialog.getByRole('button', { name: 'Move card', exact: true }).click();
  await expect(
    dialog.getByRole('status', { name: 'Card movement' }),
  ).toHaveText(`Moved ${card} to In Progress.`);
  await dialog.getByRole('button', { name: 'Close card' }).click();
  await page
    .getByRole('button', { name: 'Build the new home page', exact: true })
    .click();
  await expect(
    dialog.getByRole('status', { name: 'Card movement' }),
  ).toBeEmpty();
  await dialog.getByRole('button', { name: 'Close card' }).click();
  const column = page.getByRole('region', { name: 'In Progress', exact: true });
  await expect(
    column.getByRole('button', { name: card, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Export board JSON' }),
  ).toBeEnabled();
  await page.reload();
  await expect(
    page.getByRole('status', { name: 'Connection status' }),
  ).toHaveText('Connected');
  const titles = await column
    .locator('.sortable-surface > div:first-child > button:first-child')
    .allTextContents();
  expect(titles.slice(0, 2)).toEqual([card, 'Build the new home page']);
  await page.getByLabel('Search cards').fill(card);
  await expect(page.getByText(/Clear filters to drag cards/)).toBeVisible();
  await page.getByRole('button', { name: card, exact: true }).click();
  await expect(
    page
      .getByRole('dialog', { name: 'CARD DETAILS' })
      .getByRole('combobox', { name: 'Move to' }),
  ).toBeVisible();
});
