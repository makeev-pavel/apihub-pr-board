import { expect, openBoard, test } from './helpers.ts';

test('DATA-4: the board opens with prs.json, without a token and without errors', async ({ page, pageErrors }) => {
  await openBoard(page, { query: 'authors=all&draft=all' });
  await expect(page.locator('h1 .repo')).toHaveText('acme/widgets');
  await expect(page.locator('.board > tbody > tr')).toHaveCount(75);
  expect(pageErrors).toEqual([]);
});
