import type { Page } from '@playwright/test';
import { ALL, expect, openBoard, test } from './helpers.ts';

const TOKEN_KEY = 'apihub-pr-board.token';

// Puts a token into the browser before the page loads; the mock accepts any token.
async function withToken(page: Page) {
  await page.addInitScript((key) => localStorage.setItem(key, 'mock-token'), TOKEN_KEY);
}

async function refresh(page: Page, scenario: string) {
  await withToken(page);
  await openBoard(page, { report: 'typical', refresh: scenario, query: ALL });
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
}

test.describe('Refresh', () => {
  test('DATA-6 SET-13: Refresh without a token asks for one, then loads live data', async ({ page }) => {
    await openBoard(page, { report: 'typical', query: ALL });
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    const tokenField = page.locator('#token-input');
    await expect(tokenField).toBeFocused();
    await tokenField.fill('mock-token');
    await page.getByRole('button', { name: 'Save and refresh' }).click();
    await expect(page.locator('.source-button')).toHaveText('live, just now');
    await expect(page.locator('.source-button')).toHaveClass(/\blive\b/);
    await expect(page.locator('.board > tbody > tr')).toHaveCount(75);
  });

  test('DATA-6: a saved token refreshes at once and reads all pages', async ({ page }) => {
    await refresh(page, 'paginated');
    await expect(page.locator('.source-button')).toHaveText('live, just now');
    await expect(page.locator('.board > tbody > tr')).toHaveCount(75);
  });

  test('DATA-7: Refresh is disabled while it runs', async ({ page }) => {
    await refresh(page, 'slow');
    const button = page.getByRole('button', { name: 'Refreshing…' });
    await expect(button).toBeDisabled();
    await expect(page.locator('.source-button')).toHaveText('live, just now', { timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeEnabled();
  });

  test('DATA-14: forbidden projects load with a warning', async ({ page }) => {
    await refresh(page, 'projects-error');
    await expect(page.locator('.banner.warn')).toContainText('Project membership is unavailable for this token');
  });

  test('DATA-15: fewer PRs than totalCount give a warning', async ({ page }) => {
    await refresh(page, 'count-mismatch');
    await expect(page.locator('.banner.warn')).toContainText('GitHub reported 39 open pull requests but returned 36.');
  });

  for (const [scenario, message] of [
    ['unauthorized', 'GitHub rejected the token.'],
    ['server-error', 'GitHub API returned HTTP 502'],
    ['repo-not-found', 'GitHub GraphQL error at repository'],
    ['network', 'Cannot reach api.github.com'],
  ]) {
    test(`DATA-13 TABLE-3: ${scenario} fails with a readable message and keeps the data`, async ({ page }) => {
      await refresh(page, scenario);
      await expect(page.locator('.banner.bad')).toContainText('Refresh failed. ' + message);
      await expect(page.locator('.source-button')).toHaveText('updated just now');
      await expect(page.locator('.board > tbody > tr')).toHaveCount(36);
    });
  }

  test('DATA-8: hidden CI and Last comment columns drop their parts of the query', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('apihub-pr-board.settings', JSON.stringify({ hiddenColumns: ['ci', 'comment'] })));
    const sent: Record<string, unknown>[] = [];
    page.on('request', (request) => {
      if (request.url().endsWith('/__dev/graphql')) sent.push(JSON.parse(request.postData() || '{}').variables);
    });
    await refresh(page, 'ok');
    await expect(page.locator('.source-button')).toHaveText('live, just now');
    expect(sent.length).toBeGreaterThan(0);
    expect(sent.every((v) => v.withChecks === false && v.withComments === false)).toBe(true);
  });
});
