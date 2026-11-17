import { test, expect, isolatedContext } from './fixture';
import type { Page } from '@playwright/test';
import type { Snapshot } from '../src/realtime/protocol';

async function openDemo(page: Page, name: 'Alice' | 'Bob') {
  await page.goto('/');
  await page.getByRole('button', { name: `Try as ${name}` }).click();
  await expect(
    page.getByRole('status', { name: 'Connection status' }),
  ).toHaveText('Connected');
}

test('an author edits and deletes a comment while a teammate follows along', async ({
  browser,
}, testInfo) => {
  const aliceContext = await isolatedContext(browser, testInfo);
  const bobContext = await isolatedContext(browser, testInfo);
  const alice = await aliceContext.newPage();
  const bob = await bobContext.newPage();
  const failures: string[] = [];
  for (const page of [alice, bob])
    page.on('pageerror', (error) => failures.push(error.message));
  const suffix = crypto.randomUUID().slice(0, 8);
  const title = `Comment thread ${suffix}`;
  const first = `Frist draft ${suffix}`;
  const fixed = `First draft ${suffix}`;
  const unsent = `Half-finished rewrite ${suffix}`;
  try {
    await openDemo(alice, 'Alice');
    await openDemo(bob, 'Bob');
    await alice.getByLabel('New card in Backlog').fill(title);
    await alice
      .getByRole('region', { name: 'Backlog', exact: true })
      .getByRole('button', { name: 'Add card', exact: true })
      .click();
    for (const page of [alice, bob])
      await page.getByRole('button', { name: title, exact: true }).click();
    const aliceDialog = alice.getByRole('dialog');
    const bobDialog = bob.getByRole('dialog');

    await aliceDialog.getByLabel('Add a comment', { exact: true }).fill(first);
    await aliceDialog.getByRole('button', { name: 'Post comment' }).click();
    await expect(bobDialog.getByText(first, { exact: true })).toBeVisible();
    // Bob is another editor: he can read Alice's comment but not change it.
    await expect(
      bobDialog.getByRole('button', { name: 'Edit comment' }),
    ).toHaveCount(0);
    await expect(
      bobDialog.getByRole('button', { name: 'Delete comment' }),
    ).toHaveCount(0);

    await aliceDialog.getByRole('button', { name: 'Edit comment' }).click();
    const editor = aliceDialog.getByRole('textbox', { name: 'Edit comment' });
    await expect(editor).toBeFocused();
    await expect(editor).toHaveValue(first);
    await editor.fill(fixed);
    await aliceDialog.getByRole('button', { name: 'Save comment' }).click();
    await expect(
      aliceDialog.getByRole('button', { name: 'Edit comment' }),
    ).toBeFocused();
    for (const dialog of [aliceDialog, bobDialog]) {
      await expect(dialog.getByText(fixed, { exact: true })).toBeVisible();
      await expect(dialog.getByText(first, { exact: true })).toHaveCount(0);
      await expect(dialog.getByText('Edited', { exact: true })).toBeVisible();
    }

    // An unfinished edit guards closing and comes back with the card draft.
    await aliceDialog.getByRole('button', { name: 'Edit comment' }).click();
    await editor.fill(unsent);
    await expect(
      alice.getByRole('status', { name: 'Draft status' }),
    ).toHaveText('Draft saved on this device.');
    await alice.keyboard.press('Escape');
    await aliceDialog
      .getByRole('button', { name: 'Keep draft and close' })
      .click();
    await expect(aliceDialog).not.toBeVisible();
    await alice
      .getByRole('button', { name: `Review draft for ${title}`, exact: true })
      .click();
    await expect(editor).toHaveValue(unsent);
    await aliceDialog
      .locator('form', {
        has: alice.getByRole('textbox', { name: 'Edit comment' }),
      })
      .getByRole('button', { name: 'Cancel' })
      .click();
    await expect(aliceDialog.getByText(fixed, { exact: true })).toBeVisible();
    await expect(bobDialog.getByText(fixed, { exact: true })).toBeVisible();

    // Deleting asks once, then removes the comment for everyone.
    await aliceDialog.getByRole('button', { name: 'Delete comment' }).click();
    await expect(bobDialog.getByText(fixed, { exact: true })).toBeVisible();
    await aliceDialog
      .getByRole('button', { name: 'Confirm delete comment' })
      .click();
    for (const dialog of [aliceDialog, bobDialog])
      await expect(dialog.getByText(fixed, { exact: true })).toHaveCount(0);
    await expect(
      aliceDialog.getByRole('heading', { name: 'Conversation' }),
    ).toBeFocused();

    const boardId = new URL(alice.url()).pathname.split('/').at(-1)!;
    const { snapshot } = (await (
      await alice.request.get(`/api/boards/${boardId}`)
    ).json()) as { snapshot: Snapshot };
    const card = snapshot.cards.find((item) => item.title === title)!;
    expect(snapshot.comments.filter((item) => item.cardId === card.id)).toEqual(
      [],
    );
    expect(failures).toEqual([]);
  } finally {
    await aliceContext.close();
    await bobContext.close();
  }
});
