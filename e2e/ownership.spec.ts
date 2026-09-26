import { test, expect, isolatedContext } from './fixture';
import type { Page } from '@playwright/test';

const password = 'Portfolio-transfer-password-2026';

test('owner and recipient confirm an ownership transfer from separate accounts', async ({
  browser,
}, testInfo) => {
  const ownerContext = await isolatedContext(browser, testInfo);
  const recipientContext = await isolatedContext(browser, testInfo);
  const owner = await ownerContext.newPage();
  const recipient = await recipientContext.newPage();
  const suffix = crypto.randomUUID().slice(0, 8);
  const ownerEmail = `owner-${suffix}@example.com`;
  const recipientEmail = `recipient-${suffix}@example.com`;

  async function register(page: Page, name: string, email: string) {
    await page.goto('/register');
    await page.getByLabel('Your name').fill(name);
    await page.getByLabel('Email address').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    const submit = page.getByRole('button', { name: 'Create account' });
    await expect(submit).toBeEnabled();
    await submit.click();
    await expect(page).toHaveURL(/\/workspaces$/);
  }

  try {
    await register(owner, 'Transfer Owner', ownerEmail);
    await register(recipient, 'Transfer Recipient', recipientEmail);

    await owner
      .getByLabel('New workspace', { exact: true })
      .fill('Transfer Team');
    await owner
      .getByRole('button', { name: 'Create workspace', exact: true })
      .click();
    await expect(
      owner.getByRole('heading', { name: 'Transfer Team' }),
    ).toBeVisible();
    await owner.getByLabel('Invite a registered teammate').fill(recipientEmail);
    await owner.getByRole('button', { name: 'Add member' }).click();
    await expect(
      owner.getByText(recipientEmail, { exact: true }),
    ).toBeVisible();

    await recipient.reload();
    await expect(
      recipient.getByRole('heading', { name: 'Transfer Team' }),
    ).toBeVisible();
    await expect(
      recipient.getByRole('button', { name: 'Accept ownership' }),
    ).toHaveCount(0);

    await owner
      .getByLabel('Transfer to')
      .selectOption({ label: 'Transfer Recipient' });
    await owner.getByLabel('Confirm with your password').fill('incorrect');
    await owner.getByRole('button', { name: 'Request transfer' }).click();
    await expect(owner.getByRole('alert')).toContainText('Incorrect password');
    await owner.getByLabel('Confirm with your password').fill(password);
    await owner.getByRole('button', { name: 'Request transfer' }).click();
    await expect(
      owner.getByRole('button', { name: 'Cancel transfer' }),
    ).toBeVisible();

    await recipient.reload();
    await expect(
      recipient.getByRole('button', { name: 'Accept ownership' }),
    ).toBeVisible();
    await recipient.getByLabel('Confirm with your password').fill('incorrect');
    await recipient.getByRole('button', { name: 'Accept ownership' }).click();
    await expect(recipient.getByRole('alert')).toContainText(
      'Incorrect password',
    );
    await recipient.getByLabel('Confirm with your password').fill(password);
    await recipient.getByRole('button', { name: 'Accept ownership' }).click();
    await expect(
      recipient.getByText('WORKSPACE / OWNER', { exact: true }),
    ).toBeVisible();
    await expect(
      recipient.getByRole('button', { name: 'Accept ownership' }),
    ).toHaveCount(0);

    await owner.reload();
    await expect(
      owner.getByText('WORKSPACE / EDITOR', { exact: true }),
    ).toBeVisible();
    await expect(
      owner.getByRole('button', { name: 'Request transfer' }),
    ).toHaveCount(0);
    await expect(
      owner.getByRole('button', { name: 'Leave workspace' }),
    ).toBeVisible();
  } finally {
    await ownerContext.close();
    await recipientContext.close();
  }
});
