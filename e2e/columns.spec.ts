import type { Page } from '@playwright/test';
import { ALL, expect, openBoard, test } from './helpers.ts';

const WIDTHS_KEY = 'apihub-pr-board.columns';

function th(page: Page, label: string) {
  return page.locator('.board > thead > tr > th').filter({ hasText: label });
}

async function width(page: Page, label: string) {
  return Math.round((await th(page, label).boundingBox())!.width);
}

async function dragEdge(page: Page, label: string, dx: number) {
  const box = (await th(page, label).locator('.col-resizer').boundingBox())!;
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + dx, y, { steps: 5 });
  await page.mouse.up();
}

async function openSettings(page: Page) {
  await page.getByRole('button', { name: /^Settings/ }).click();
  return page.getByRole('dialog', { name: 'Settings' });
}

test.describe('columns', () => {
  test('TABLE-24 SET-11: dragging an edge resizes the column, and the width survives a reload', async ({ page }) => {
    await openBoard(page, { report: 'typical', query: ALL });
    expect(await width(page, 'Author')).toBe(170);
    await dragEdge(page, 'Author', 60);
    expect(await width(page, 'Author')).toBe(230);
    await page.reload();
    expect(await width(page, 'Author')).toBe(230);
    expect(JSON.parse((await page.evaluate((key) => localStorage.getItem(key), WIDTHS_KEY))!)).toMatchObject({ author: 230 });
  });

  test('TABLE-24: arrow keys resize a focused edge, double-click resets it, and 56 px is the minimum', async ({ page }) => {
    await openBoard(page, { report: 'typical', query: ALL });
    const edge = th(page, 'Author').locator('.col-resizer');
    await edge.focus();
    await page.keyboard.press('ArrowRight');
    expect(await width(page, 'Author')).toBe(186);
    await edge.dblclick();
    expect(await width(page, 'Author')).toBe(170);
    await dragEdge(page, 'Author', -400);
    expect(await width(page, 'Author')).toBe(56);
  });

  test('TABLE-24: the resize handle sits on the column line', async ({ page }) => {
    await openBoard(page, { report: 'typical', query: ALL });
    for (const label of ['#', 'Author', 'Review']) {
      const cell = (await th(page, label).boundingBox())!;
      const handle = (await th(page, label).locator('.col-resizer').boundingBox())!;
      expect(Math.abs(handle.x + handle.width / 2 - (cell.x + cell.width))).toBeLessThanOrEqual(1);
    }
  });

  test('TABLE-23: thin lines separate the columns, except after the last one', async ({ page }) => {
    await openBoard(page, { report: 'typical', query: ALL });
    const borders = await page.locator('.board > tbody > tr').first().locator('td').evaluateAll((tds) => tds.map((td) => getComputedStyle(td).borderRightWidth));
    expect(borders.slice(0, -1).every((b) => b === '1px')).toBe(true);
    expect(borders.at(-1)).toBe('0px');
  });

  test('TABLE-22: the table fills the window, and wide columns scroll sideways', async ({ page }) => {
    await page.setViewportSize({ width: 2400, height: 900 });
    await openBoard(page, { report: 'typical', query: ALL });
    const wrap = page.locator('.table-wrap');
    const fill = async () => wrap.evaluate((el) => [el.clientWidth, Math.round(el.querySelector('table')!.getBoundingClientRect().width)]);
    const [available, table] = await fill();
    expect(table).toBe(available);
    await page.setViewportSize({ width: 1200, height: 900 });
    expect(await wrap.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  });

  test('TABLE-5 TABLE-22 SET-8: hidden columns disappear, the rest still fill the window', async ({ page }) => {
    await page.setViewportSize({ width: 2400, height: 900 });
    await openBoard(page, { report: 'typical', query: ALL });
    const panel = await openSettings(page);
    await expect(panel.getByLabel('#', { exact: true })).toBeDisabled();
    await expect(panel.getByLabel('Pull request', { exact: true })).toBeDisabled();
    for (const label of ['Assignee', 'Last comment', 'Attention', 'Standup']) await panel.getByLabel(label, { exact: true }).uncheck();
    await page.keyboard.press('Escape');
    await expect(page.locator('.board > thead > tr > th')).toHaveCount(8);
    await expect(th(page, 'Assignee')).toHaveCount(0);
    const [available, table] = await page.locator('.table-wrap').evaluate((el) => [el.clientWidth, Math.round(el.querySelector('table')!.getBoundingClientRect().width)]);
    expect(table).toBe(available);
  });

  test('SET-8: Reset column widths in Settings restores every column', async ({ page }) => {
    await openBoard(page, { report: 'typical', query: ALL });
    const panel = await openSettings(page);
    await expect(panel.getByRole('button', { name: 'Reset column widths' })).toBeDisabled();
    await page.keyboard.press('Escape');
    await dragEdge(page, 'Author', 60);
    await openSettings(page);
    await panel.getByRole('button', { name: 'Reset column widths' }).click();
    expect(await width(page, 'Author')).toBe(170);
    expect(await page.evaluate((key) => localStorage.getItem(key), WIDTHS_KEY)).toBeNull();
  });
});
