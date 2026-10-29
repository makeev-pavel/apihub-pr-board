import { ALL, expect, openBoard, rows, test } from './helpers.ts';

const TOKEN_KEY = 'apihub-pr-board.token';

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

  test('DATA-16 DATA-23: without prs.json and without repositories, the table says how to choose them', async ({ page }) => {
    await openBoard(page, { report: 'missing' });
    await expect(page.locator('.banner.bad')).toHaveCount(0);
    await expect(page.getByText('Choose the repositories to show')).toBeVisible();
    await expect(page.locator('.board > tbody')).toContainText('Add them in Settings, or open a link with ?repos=owner/name.');
  });

  test('DATA-23: without prs.json and without a token, a banner names the repositories and asks for a token', async ({ page }) => {
    await openBoard(page, { report: 'missing', query: 'repos=acme/gadgets' });
    await expect(page.locator('.banner.bad')).toHaveCount(0);
    await expect(page.locator('.banner.warn')).toContainText('acme/gadgets is not loaded yet. Add a GitHub token in Settings, then Refresh loads it.');
    await expect(page.getByText('No pull requests loaded yet')).toBeVisible();
  });

  test('DATA-23: without prs.json, a saved token and a link load the board by themselves, and new repositories load too', async ({ page }) => {
    let graphqlCalls = 0;
    page.on('request', (request) => { if (request.url().endsWith('/__dev/graphql')) graphqlCalls += 1; });
    await page.addInitScript((key) => localStorage.setItem(key, 'mock-token'), TOKEN_KEY);
    await openBoard(page, { report: 'missing', refresh: 'ok', query: ALL + '&repos=acme/gadgets' });
    await expect(page.locator('.source-button')).toHaveText('live, just now');
    await expect(rows(page)).toHaveCount(4);
    await expect(page.locator('.banner')).toHaveCount(0);
    await page.getByRole('button', { name: /^Settings/ }).click();
    const field = page.getByRole('dialog', { name: 'Settings' }).getByRole('textbox', { name: 'Repositories' });
    await field.fill('acme/gadgets acme/widgets');
    await field.press('Enter');
    await expect(rows(page)).toHaveCount(79);
    // One query a page and repository: gadgets, then widgets (75 PRs, four pages of 20) and gadgets. Nothing after that.
    expect(graphqlCalls).toBe(6);
    await page.waitForTimeout(1000);
    expect(graphqlCalls).toBe(6);
  });

  test('DATA-23: a repository that cannot be read is loaded once, not again and again', async ({ page }) => {
    let graphqlCalls = 0;
    page.on('request', (request) => { if (request.url().endsWith('/__dev/graphql')) graphqlCalls += 1; });
    await page.addInitScript((key) => localStorage.setItem(key, 'mock-token'), TOKEN_KEY);
    await openBoard(page, { report: 'missing', refresh: 'ok', query: 'repos=acme/nowhere' });
    await expect(page.locator('.banner.bad')).toContainText('Refresh failed.');
    await page.waitForTimeout(1000);
    expect(graphqlCalls).toBe(1);
  });

  test('SET-18: without a token, a dialog explains how to create one; Not now and Escape close it until a reload', async ({ page }) => {
    await openBoard(page, { report: 'missing', query: 'repos=acme/gadgets' });
    const dialog = page.getByRole('dialog', { name: 'Add a GitHub token' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('link', { name: 'Create a fine-grained token' }))
      .toHaveAttribute('href', 'https://github.com/settings/personal-access-tokens/new');
    await expect(dialog).toContainText('Public repositories (read-only)');
    await expect(dialog).toContainText('github_pat_');
    await expect(dialog.getByLabel('Token')).toHaveAttribute('type', 'password');
    await expect(dialog.locator('form')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Not now' }).click();
    await expect(dialog).toHaveCount(0);
    // It stays closed when the repositories change, here from one to two.
    await page.getByRole('button', { name: /^Settings/ }).click();
    const field = page.getByRole('dialog', { name: 'Settings' }).getByRole('textbox', { name: 'Repositories' });
    await field.fill('acme/widgets acme/gadgets');
    await field.press('Enter');
    await expect(page).toHaveURL(/repos=acme\/widgets,acme\/gadgets/);
    await expect(dialog).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.locator('.banner.warn').getByRole('button', { name: 'Add token' }).click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });

  test('SET-18 DATA-23: Save and load in the dialog stores the token and loads the board', async ({ page }) => {
    await openBoard(page, { report: 'missing', refresh: 'ok', query: ALL + '&repos=acme/gadgets' });
    const dialog = page.getByRole('dialog', { name: 'Add a GitHub token' });
    const save = dialog.getByRole('button', { name: 'Save and load' });
    await expect(save).toBeDisabled();
    await dialog.getByLabel('Token').fill('mock-token');
    await dialog.getByLabel('Token').press('Enter');
    await expect(dialog).toHaveCount(0);
    await expect(rows(page)).toHaveCount(4);
    expect(await page.evaluate((key) => localStorage.getItem(key), TOKEN_KEY)).toBe('mock-token');
  });
});
