import type { Page } from '@playwright/test';
import { ALL, expect, openBoard, test } from './helpers.ts';

// Takes back the "wizard done" the shared setup writes, for the first load only, as on a first visit.
async function firstVisit(page: Page) {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('first-visit')) return;
    sessionStorage.setItem('first-visit', '1');
    localStorage.removeItem('apihub-pr-board.wizard');
  });
}

test.describe('setup wizard', () => {
  test('SET-21: a first visit opens the wizard, each choice applies at once with a picture, and Done closes it for good', async ({ page }) => {
    await firstVisit(page);
    await openBoard(page, { report: 'typical', query: ALL });
    const wizard = page.getByRole('dialog', { name: 'Set up your board' });
    await expect(wizard).toContainText('Step 1 of 3');
    const themes = wizard.getByRole('group', { name: 'Theme' });
    await expect(themes.getByRole('button')).toHaveCount(3);
    for (const [name, hint] of [['System', 'Follows the light or dark setting of your system.'], ['Light', 'Dark text on a light background.'],
      ['Dark', 'Light text on a dark background.']]) {
      await expect(themes.getByRole('button', { name, exact: true })).toHaveAccessibleDescription(hint);
    }
    await expect(themes.getByRole('button', { name: 'System' })).toHaveAttribute('aria-pressed', 'true');
    // System shows the light and the dark board together; Light and Dark show their own.
    await expect(themes.locator('.theme-light')).toHaveCount(2);
    await expect(themes.locator('.theme-dark')).toHaveCount(2);
    await themes.getByRole('button', { name: 'Dark' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(themes.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'true');

    await wizard.getByRole('button', { name: 'Next' }).click();
    await expect(wizard).toContainText('Step 2 of 3');
    const density = wizard.getByRole('group', { name: 'Row density' });
    // The next pictures draw in the theme just picked.
    await expect(density.locator('.theme-light')).toHaveCount(0);
    await density.getByRole('button', { name: 'Compact' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-density', 'compact');

    await wizard.getByRole('button', { name: 'Next' }).click();
    await wizard.getByRole('group', { name: 'Review column' }).getByRole('button', { name: 'Reviewers' }).click();
    await expect(page.locator('.board .reviewers-wrap').first()).toBeAttached();
    await wizard.getByRole('button', { name: 'Back' }).click();
    await expect(wizard).toContainText('Step 2 of 3');
    await wizard.getByRole('button', { name: 'Next' }).click();
    await wizard.getByRole('button', { name: 'Done' }).click();
    await expect(wizard).toHaveCount(0);

    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('apihub-pr-board.settings')!));
    expect([saved.theme, saved.density, saved.reviewColumn]).toEqual(['dark', 'compact', 'list']);
    await page.reload();
    await expect(page.locator('.board > tbody > tr').first()).toBeVisible();
    await expect(wizard).toHaveCount(0);
    // Settings opens it again; Escape closes it.
    await page.getByRole('button', { name: /^Settings/ }).click();
    await page.getByRole('button', { name: 'Setup wizard' }).click();
    await expect(wizard).toContainText('Step 1 of 3');
    await page.keyboard.press('Escape');
    await expect(wizard).toHaveCount(0);
  });

  test('SET-21 SET-18: on a page without a snapshot, the token dialog waits until the wizard is skipped', async ({ page }) => {
    await firstVisit(page);
    await page.request.post('/__dev/state', { data: { report: 'missing', refresh: 'ok' } });
    await page.goto('/?repos=acme/gadgets');
    const wizard = page.getByRole('dialog', { name: 'Set up your board' });
    await expect(wizard).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Add a GitHub token' })).toHaveCount(0);
    await wizard.getByRole('button', { name: 'Skip' }).click();
    await expect(page.getByRole('dialog', { name: 'Add a GitHub token' })).toBeVisible();
  });
});
