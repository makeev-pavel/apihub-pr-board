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
    await expect(rows(page)).toHaveCount(80);
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

  test('FILTER-14: repos in the address narrow the board, and Reset view and Copy link keep them', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openBoard(page, { report: 'two-repos', query: ALL + '&q=pairing&repos=acme/gadgets' });
    await expect(page.locator('h1 .repo')).toHaveText('acme/gadgets');
    await expect(rows(page)).toHaveCount(2);
    await expect(page.locator('.board > thead > tr > th').first()).toHaveText('#');
    await page.getByRole('button', { name: 'Reset view' }).click();
    await expect(page).toHaveURL(/\/\?repos=acme\/gadgets$/);
    await page.getByRole('button', { name: 'Copy link to this view' }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\?repos=acme\/gadgets$/);
  });

  test('SET-16: the Repositories field writes the address, rejects a bad entry with the reason, and clears', async ({ page }) => {
    await openBoard(page, { report: 'two-repos', query: ALL });
    await page.getByRole('button', { name: /^Settings/ }).click();
    const field = page.getByRole('dialog', { name: 'Settings' }).getByRole('textbox', { name: 'Repositories' });
    await expect(field).toHaveAttribute('placeholder', 'acme/widgets, acme/gadgets');
    await field.fill('acme/widgets, gadgets');
    await field.press('Enter');
    await expect(page.getByRole('alert')).toHaveText('"gadgets" is not owner/name, such as acme/widgets.');
    await expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(page.url()).not.toContain('repos=');
    await field.fill('acme/gadgets  ACME/gadgets');
    await field.press('Enter');
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(field).toHaveValue('acme/gadgets');
    await expect(page).toHaveURL(/[?&]repos=acme\/gadgets(&|$)/);
    await expect(rows(page)).toHaveCount(4);
    await field.fill('');
    await field.blur();
    await expect(rows(page)).toHaveCount(40);
    expect(page.url()).not.toContain('repos=');
  });

  test('SET-17: bots saved by an earlier version move into the address, and Reset to defaults removes both', async ({ page }) => {
    await page.addInitScript(() => {
      if (sessionStorage.getItem('seeded')) return;
      localStorage.setItem('apihub-pr-board.settings', JSON.stringify({ rules: { extraBots: ['acme-release-bot'] } }));
      sessionStorage.setItem('seeded', '1');
    });
    await openBoard(page, { report: 'two-repos', query: 'repos=acme/widgets' });
    await expect(page).toHaveURL(/\?repos=acme\/widgets&bots=acme-release-bot$/);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('apihub-pr-board.settings')!));
    expect(saved.rules.extraBots).toEqual([]);
    await page.reload();
    await expect(page).toHaveURL(/\?repos=acme\/widgets&bots=acme-release-bot$/);
    await page.getByRole('button', { name: /^Settings/ }).click();
    await page.getByRole('dialog', { name: 'Settings' }).getByRole('button', { name: 'Reset to defaults' }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test('DATA-22: repositories missing from the snapshot get a banner, and Refresh with a token loads them', async ({ page }) => {
    await openBoard(page, { report: 'mixed', refresh: 'ok', query: ALL + '&repos=acme/widgets,acme/gadgets' });
    const banner = page.locator('.banner.warn');
    await expect(banner).toContainText('acme/gadgets is not in the snapshot. Add a GitHub token in Settings, then Refresh loads it.');
    await expect(rows(page)).toHaveCount(76);
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await page.getByRole('dialog', { name: 'Add a GitHub token' }).getByLabel('Token').fill('mock-token');
    await page.getByRole('button', { name: 'Save and load' }).click();
    await expect(page.locator('.source-button')).toHaveText('live, just now');
    await expect(rows(page)).toHaveCount(80);
    await expect(banner).toHaveCount(0);
  });

  test('DATA-22 SET-16: Refresh reads the repositories set in Settings, and live data names what it lacks', async ({ page }) => {
    await page.addInitScript((key) => localStorage.setItem(key, 'mock-token'), TOKEN_KEY);
    await openBoard(page, { report: 'mixed', refresh: 'ok', query: ALL });
    await page.getByRole('button', { name: /^Settings/ }).click();
    const field = page.getByRole('dialog', { name: 'Settings' }).getByRole('textbox', { name: 'Repositories' });
    await field.fill('acme/gadgets');
    await field.press('Enter');
    const banner = page.locator('.banner.warn');
    await expect(banner).toHaveText('acme/gadgets is not in the snapshot. Refresh loads it.');
    await expect(page.getByText('No pull requests match this view')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await expect(page.locator('.source-button')).toHaveText('live, just now');
    await expect(rows(page)).toHaveCount(4);
    await expect(banner).toHaveCount(0);
    await page.getByRole('button', { name: /^Settings/ }).click();
    await field.fill('acme/gadgets acme/widgets');
    await field.press('Enter');
    await expect(banner).toHaveText('acme/widgets is not in the live data. Refresh loads it.');
  });

  test('SET-19 FILTER-17: groups from Settings fill a Repositories menu that edits repos in the address', async ({ page }) => {
    await openBoard(page, { report: 'two-repos', query: ALL });
    await expect(page.getByRole('button', { name: /^Repositories:/ })).toHaveCount(0);
    await page.getByRole('button', { name: /^Settings/ }).click();
    const field = page.getByRole('dialog', { name: 'Settings' }).getByRole('textbox', { name: 'Repository groups' });
    await field.fill('Widgets: acme/widgets\nacme/gadgets');
    await field.blur();
    await expect(page.getByRole('alert')).toHaveText('Line 2: start with the group name and a colon, such as "Backend: acme/widgets".');
    await field.fill('Widgets: acme/widgets\nGadgets: acme/gadgets');
    await field.press('Control+Enter');
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.keyboard.press('Escape');

    const button = page.getByRole('button', { name: /^Repositories:/ });
    await expect(button).toHaveText(/Repositories:\s*All/);
    await button.click();
    const menu = page.getByRole('group', { name: 'Repositories' });
    await menu.getByRole('checkbox', { name: 'Gadgets' }).check();
    await expect(page).toHaveURL(/[?&]repos=acme\/gadgets(&|$)/);
    await expect(rows(page)).toHaveCount(4);
    await expect(button).toHaveText(/Repositories:\s*Gadgets/);
    await menu.getByRole('checkbox', { name: 'Widgets' }).check();
    await expect(page).toHaveURL(/[?&]repos=acme\/gadgets,acme\/widgets(&|$)/);
    await expect(rows(page)).toHaveCount(40);
    await menu.getByRole('button', { name: 'All repositories' }).click();
    expect(page.url()).not.toContain('repos=');
    // The groups stay in this browser.
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('apihub-pr-board.settings')!).repoGroups);
    expect(stored).toEqual([{ name: 'Widgets', repos: ['acme/widgets'] }, { name: 'Gadgets', repos: ['acme/gadgets'] }]);
  });
});
