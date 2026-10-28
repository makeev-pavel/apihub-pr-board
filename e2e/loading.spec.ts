import { expect, openBoard, test } from './helpers.ts';

const ALL = 'authors=all&draft=all';

test.describe('loading prs.json', () => {
  test('DATA-4 TABLE-2: the snapshot opens with a gray dot and its age', async ({ page }) => {
    await openBoard(page, { report: 'typical', query: ALL });
    await expect(page.locator('.board > tbody > tr')).toHaveCount(36);
    const source = page.locator('.source-button');
    await expect(source).toHaveText('updated just now');
    await expect(source).not.toHaveClass(/\blive\b/);
  });

  test('TABLE-2: an old snapshot shows its age', async ({ page }) => {
    await openBoard(page, { report: 'stale', query: ALL });
    await expect(page.locator('.source-button')).toHaveText('updated 3 days ago');
  });

  test('DATA-9: the corner cases render, one row each', async ({ page }) => {
    await openBoard(page, { report: 'corner', query: ALL });
    await expect(page.locator('.board > tbody > tr')).toHaveCount(39);
    await expect(page.locator('.board .note').first()).toBeVisible();
  });

  test('QUAL-8: 300 PRs render', async ({ page }) => {
    await openBoard(page, { report: 'many', query: ALL });
    await expect(page.locator('.board > tbody > tr')).toHaveCount(300);
  });

  test('TABLE-20: an empty board says so and offers Reset view', async ({ page }) => {
    await openBoard(page, { report: 'empty' });
    await expect(page.getByText('No pull requests match this view')).toBeVisible();
    await expect(page.locator('.empty').getByRole('button', { name: 'Reset view' })).toBeVisible();
  });

  test('TABLE-19: a slow prs.json shows the loading row first', async ({ page }) => {
    await page.request.post('/__dev/state', { data: { report: 'slow', refresh: 'ok' } });
    await page.goto('/');
    await expect(page.getByText('Loading pull requests…')).toBeVisible();
    await expect(page.getByText('Loading pull requests…')).toHaveCount(0, { timeout: 10_000 });
    await expect(page.locator('.board > tbody > tr').first()).toBeVisible();
  });

  test('DATA-14 TABLE-3: forbidden project data loads with a warning', async ({ page }) => {
    await openBoard(page, { report: 'projects-unavailable', query: ALL });
    await expect(page.locator('.banner.warn')).toContainText('Project membership is unavailable for this token');
    await expect(page.locator('.board > tbody > tr')).toHaveCount(36);
  });

  for (const [report, reason] of [
    ['missing', 'HTTP 404'],
    ['broken', 'JSON'],
    ['wrong-shape', 'the file has no list of pull requests'],
  ]) {
    test(`DATA-5 DATA-16: ${report} prs.json says why and suggests Refresh`, async ({ page }) => {
      await openBoard(page, { report });
      const banner = page.locator('.banner.bad');
      await expect(banner).toContainText('Cannot load prs.json (');
      await expect(banner).toContainText(reason);
      await expect(banner).toContainText('Use Refresh with a token to load live data.');
    });
  }
});
