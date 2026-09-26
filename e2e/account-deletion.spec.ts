import { test, expect, isolatedContext } from './fixture';
import type { Page } from '@playwright/test';

const password = 'Portfolio-account-password-2026';

test('a member can delete their login while a workspace owner keeps access', async ({
  browser,
}, testInfo) => {
  const ownerContext = await isolatedContext(browser, testInfo);
  const memberContext = await isolatedContext(browser, testInfo);
  const owner = await ownerContext.newPage();
  const member = await memberContext.newPage();
  const suffix = crypto.randomUUID().slice(0, 8);
  const ownerEmail = `owner-delete-${suffix}@example.com`;
  const memberEmail = `member-delete-${suffix}@example.com`;

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
    await register(owner, 'Workspace Owner', ownerEmail);
    await register(member, 'Leaving Member', memberEmail);
    await owner.getByLabel('New workspace', { exact: true }).fill('Keep Team');
    await owner.getByRole('button', { name: 'Create workspace' }).click();
    await owner.getByLabel('Invite a registered teammate').fill(memberEmail);
    await owner.getByRole('button', { name: 'Add member' }).click();
    await expect(owner.getByText(memberEmail, { exact: true })).toBeVisible();

    await member.reload();
    await expect(
      member.getByRole('heading', { name: 'Keep Team' }),
    ).toBeVisible();
    await member.getByRole('button', { name: 'Delete my account' }).click();
    await expect(
      member.getByText(
        'Your email, name, password and sessions will be removed.',
        {
          exact: false,
        },
      ),
    ).toBeVisible();
    await member
      .getByLabel('Confirm with your password')
      .fill('wrong-password');
    await member.getByLabel('I understand this cannot be undone.').check();
    await member
      .getByRole('button', { name: 'Permanently delete account' })
      .click();
    await expect(member.getByRole('alert')).toHaveText('Incorrect password');
    await member.getByLabel('Confirm with your password').fill(password);
    await member
      .getByRole('button', { name: 'Permanently delete account' })
      .click();
    await expect(member).toHaveURL(/\/login$/);

    await member.getByLabel('Email address').fill(memberEmail);
    await member.getByLabel('Password', { exact: true }).fill(password);
    const signIn = member.getByRole('button', { name: 'Sign in', exact: true });
    await expect(signIn).toBeEnabled();
    await signIn.click();
    await expect(member.getByRole('alert')).toHaveText(
      'Invalid email or password',
    );
    await owner.reload();
    await expect(
      owner.getByRole('heading', { name: 'Keep Team' }),
    ).toBeVisible();
    await expect(owner.getByText(memberEmail, { exact: true })).toHaveCount(0);
  } finally {
    await ownerContext.close();
    await memberContext.close();
  }
});
