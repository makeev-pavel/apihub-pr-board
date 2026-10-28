import { ALL, expect, openBoard, rows, test } from './helpers.ts';

const TOKEN_KEY = 'apihub-pr-board.token';

test.describe('several repositories', () => {
  test('DATA-20 DATA-21: equal numbers from two repositories are two rows', async ({ page, pageErrors }) => {
    await openBoard(page, { report: 'two-repos', query: ALL });
    await expect(page.locator('h1 .repo')).toHaveText('acme/widgets, acme/gadgets');
    await expect(rows(page)).toHaveCount(40);
    await expect(rows(page).filter({ has: page.getByRole('link', { name: '#101', exact: true }) })).toHaveCount(2);
    expect(pageErrors).toEqual([]);
  });

  test('DATA-20: the comments panel reads a PR from its own repository', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (request) => { if (request.url().includes('/__dev/rest/')) requests.push(new URL(request.url()).pathname); });
    await openBoard(page, { report: 'two-repos', query: ALL + '&q=' + encodeURIComponent('repo:gadgets "version on connect"') });
    await expect(rows(page)).toHaveCount(1);
    await rows(page).first().locator('.comment-preview').click();
    const panel = page.getByRole('dialog', { name: 'Comments on PR #101' });
    await expect(panel.locator('article')).toHaveCount(1);
    await expect(panel.locator('article')).toContainText('Tested on the gadget bench');
    expect(requests).toContain('/__dev/rest/repos/acme/gadgets/issues/101/comments');
  });

  test('DATA-18: Refresh reads every repository on the page', async ({ page }) => {
    await page.addInitScript((key) => localStorage.setItem(key, 'mock-token'), TOKEN_KEY);
    await openBoard(page, { report: 'two-repos', refresh: 'ok', query: ALL });
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await expect(page.locator('.source-button')).toHaveText('live, just now');
    // The mixed board of acme/widgets and the four PRs of acme/gadgets.
    await expect(rows(page)).toHaveCount(79);
    await expect(page.locator('h1 .repo')).toHaveText('acme/widgets, acme/gadgets');
  });

  test('TABLE-26: one repository has no Repository column and no setting for it', async ({ page }) => {
    await openBoard(page, { report: 'typical', query: ALL });
    await expect(page.locator('.board > thead > tr > th').first()).toHaveText('#');
    await page.getByRole('button', { name: /^Settings/ }).click();
    const settings = page.getByRole('dialog', { name: 'Settings' });
    await expect(settings.getByRole('checkbox', { name: 'Author' })).toBeVisible();
    await expect(settings.getByRole('checkbox', { name: 'Repository' })).toHaveCount(0);
  });

  test('TABLE-26: with two repositories the Repository column comes first, sorts, and can be hidden', async ({ page }) => {
    await openBoard(page, { report: 'two-repos', query: ALL });
    const header = page.locator('.board > thead > tr > th').first();
    await expect(header).toHaveText('Repository');
    const firstCell = rows(page).first().locator('td').first();
    await header.getByRole('button').click();
    await expect(firstCell).toHaveText('gadgets');
    await expect(firstCell.getByRole('link')).toHaveAttribute('href', 'https://github.com/acme/gadgets');
    await expect(rows(page).first().getByRole('link', { name: '#107', exact: true })).toBeVisible();
    await header.getByRole('button').click();
    await expect(firstCell).toHaveText('widgets');
    await page.getByRole('button', { name: /^Settings/ }).click();
    await page.getByRole('dialog', { name: 'Settings' }).getByRole('checkbox', { name: 'Repository' }).uncheck();
    await expect(header).toHaveText('#');
  });
});
