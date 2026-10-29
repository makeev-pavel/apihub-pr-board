import type { Page } from '@playwright/test';
import { ALL, expect, MOCK_NOW, openBoard, rows, test } from './helpers.ts';

const NOTES_KEY = 'apihub-pr-board.notes';
const PR_KEY = 'acme/widgets#206';
const DAY_MS = 24 * 60 * 60 * 1000;

// The page and this process share the machine's time zone, so they agree on the local day.
function localDay(time: number): string {
  const date = new Date(time);
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
}
const TODAY = localDay(Date.parse(MOCK_NOW));
const YESTERDAY = localDay(Date.parse(MOCK_NOW) - DAY_MS);

async function seedNotes(page: Page, notes: unknown) {
  await page.addInitScript(([key, value]) => {
    if (sessionStorage.getItem('seeded')) return;
    localStorage.setItem(key, value);
    sessionStorage.setItem('seeded', '1');
  }, [NOTES_KEY, JSON.stringify(notes)]);
}

async function openPr206(page: Page) {
  await openBoard(page, { report: 'typical', query: ALL + '&q=' + encodeURIComponent('#206') });
  await expect(rows(page)).toHaveCount(1);
  return rows(page).first().locator('td.c-notes');
}

test.describe('standup notes', () => {
  test('NOTE-3 NOTE-4 NOTE-2: a note is checked and written today, and survives a reload', async ({ page }) => {
    const cell = await openPr206(page);
    const asked = cell.getByRole('checkbox', { name: 'Status asked today, PR #206' });
    await expect(asked).not.toBeChecked();
    await expect(cell.locator('.note-preview')).toHaveText('Add note');
    await asked.check();
    await cell.locator('.note-preview').click();
    const popover = page.getByRole('dialog', { name: 'Standup notes for PR #206' });
    await expect(popover.getByRole('checkbox', { name: 'Status asked' })).toBeChecked();
    await popover.getByRole('textbox', { name: "Today's note" }).fill('Fix the tests by noon');
    await popover.getByRole('textbox', { name: "Today's note" }).press('Control+Enter');
    await expect(cell.locator('.note-preview')).toHaveText('Fix the tests by noon');
    await expect(cell.locator('.note-preview')).not.toHaveClass(/faded/);
    await page.reload();
    await expect(page.locator('td.c-notes .note-preview')).toHaveText('Fix the tests by noon');
    await expect(page.getByRole('checkbox', { name: 'Status asked today, PR #206' })).toBeChecked();
    const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), NOTES_KEY);
    expect(stored).toEqual({ [PR_KEY]: [{ date: TODAY, asked: true, text: 'Fix the tests by noon' }] });
  });

  test('NOTE-4: closing the popover with Escape saves the draft, and typing marks the PR as asked', async ({ page }) => {
    const cell = await openPr206(page);
    await cell.locator('.note-preview').click();
    await page.getByRole('textbox', { name: "Today's note" }).fill('Waiting for review');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Standup notes for PR #206' })).toHaveCount(0);
    await expect(cell.locator('.note-preview')).toHaveText('Waiting for review');
    await expect(cell.getByRole('checkbox')).toBeChecked();
  });

  test('NOTE-3 NOTE-4: yesterday\'s note is the faded reminder today, and the popover lists it', async ({ page }) => {
    await seedNotes(page, { [PR_KEY]: [{ date: YESTERDAY, asked: true, text: 'Fix the tests by noon' }] });
    const cell = await openPr206(page);
    await expect(cell.getByRole('checkbox')).not.toBeChecked();
    await expect(cell.locator('.note-preview')).toHaveText('Yesterday: Fix the tests by noon');
    await expect(cell.locator('.note-preview')).toHaveClass(/faded/);
    await cell.locator('.note-preview').click();
    const history = page.getByRole('dialog', { name: 'Standup notes for PR #206' }).locator('.note-history li');
    await expect(history).toHaveCount(1);
    await expect(history.first()).toContainText('Yesterday');
    await expect(history.first()).toContainText('asked');
    await expect(history.first()).toContainText('Fix the tests by noon');
  });

  test('NOTE-5: at midnight the checkbox starts empty and today\'s note becomes yesterday\'s', async ({ page }) => {
    await seedNotes(page, { [PR_KEY]: [{ date: TODAY, asked: true, text: 'Tests fixed' }] });
    const cell = await openPr206(page);
    await expect(cell.getByRole('checkbox')).toBeChecked();
    await page.clock.setFixedTime(Date.parse(MOCK_NOW) + DAY_MS);
    await page.clock.runFor(60 * 1000);
    await expect(cell.getByRole('checkbox')).not.toBeChecked();
    await expect(cell.locator('.note-preview')).toHaveText('Yesterday: Tests fixed');
  });

  test('NOTE-3 SET-8: the Standup column comes after Attention and can be hidden', async ({ page }) => {
    await openBoard(page, { report: 'typical', query: ALL });
    await expect(page.locator('.board > thead > tr > th').last()).toHaveText('Standup');
    await page.getByRole('button', { name: /^Settings/ }).click();
    await page.getByRole('dialog', { name: 'Settings' }).getByRole('checkbox', { name: 'Standup' }).uncheck();
    await expect(page.locator('.board > thead > tr > th').last()).toHaveText(/^Attention/);
  });
});
