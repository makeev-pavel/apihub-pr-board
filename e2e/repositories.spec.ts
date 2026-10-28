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
});
