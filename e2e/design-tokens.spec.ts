import { test, expect } from './fixture';

function luminance(color: string) {
  const values = color
    .match(/\d+(?:\.\d+)?/g)
    ?.slice(0, 3)
    .map(Number);
  if (!values || values.length !== 3)
    throw new Error(`Invalid color: ${color}`);
  const channels = values.map((value) => {
    const component = value / 255;
    return component <= 0.04045
      ? component / 12.92
      : ((component + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a: string, b: string) {
  const first = luminance(a);
  const second = luminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

test('semantic controls remain readable in both themes', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByLabel('Email address')).toBeEnabled();
  const input = page.getByLabel('Email address');
  await input.fill('typing@example.com');
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, theme);
    await page.waitForFunction(() => {
      const sample = document.createElement('span');
      sample.style.color = 'var(--color-primary)';
      document.documentElement.appendChild(sample);
      const expected = getComputedStyle(sample).color;
      sample.remove();
      return (
        getComputedStyle(document.querySelector('button.button')!)
          .backgroundColor === expected
      );
    });
    const colors = await page.evaluate(() => {
      const sample = document.createElement('span');
      document.documentElement.appendChild(sample);
      const color = (value: string) => {
        sample.style.color = value;
        return getComputedStyle(sample).color;
      };
      const root = getComputedStyle(document.documentElement);
      const token = (name: string) => color(root.getPropertyValue(name));
      const button = getComputedStyle(document.querySelector('button.button')!);
      const field = getComputedStyle(document.querySelector('input')!);
      const result = {
        surface: token('--color-surface'),
        foreground: token('--color-foreground'),
        muted: token('--color-muted'),
        focus: token('--color-focus'),
        buttonText: button.color,
        buttonBackground: button.backgroundColor,
        fieldBorder: field.borderTopColor,
        fieldBackground: field.backgroundColor,
      };
      sample.remove();
      return result;
    });
    expect(contrast(colors.foreground, colors.surface)).toBeGreaterThanOrEqual(
      4.5,
    );
    expect(contrast(colors.muted, colors.surface)).toBeGreaterThanOrEqual(4.5);
    expect(
      contrast(colors.buttonText, colors.buttonBackground),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrast(colors.fieldBorder, colors.fieldBackground),
    ).toBeGreaterThanOrEqual(3);
    expect(contrast(colors.focus, colors.surface)).toBeGreaterThanOrEqual(3);
    await expect(input).toHaveValue('typing@example.com');
  }
});
