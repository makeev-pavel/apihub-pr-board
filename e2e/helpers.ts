// Shared setup for the browser tests: a pinned clock, a clean mock server state, and the board opened on a scenario.

import { test as base, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

// The same moment for the mock server (PR_BOARD_MOCK_NOW) and the page clock, so ages never drift.
export const MOCK_NOW = '2026-10-28T12:00:00Z';
export const E2E_PORT = 5174;

export interface BoardOptions {
  // A prs.json scenario id from the DEV panel; "mixed" (typical board and corner cases) by default.
  report?: string;
  // A Refresh scenario id; "ok" by default.
  refresh?: string;
  // The URL query, without "?".
  query?: string;
}

async function setScenarios(page: Page, report: string, refresh: string) {
  const response = await page.request.post('/__dev/state', { data: { report, refresh } });
  expect(response.ok()).toBe(true);
}

// Opens the board on a scenario and waits until the table has left the loading state.
export async function openBoard(page: Page, { report = 'mixed', refresh = 'ok', query = '' }: BoardOptions = {}) {
  await setScenarios(page, report, refresh);
  await page.goto(query ? '/?' + query : '/');
  await expect(page.getByText('Loading pull requests…')).toHaveCount(0);
}

// Every test gets a fixed clock, the default scenarios, and a list of uncaught page errors to assert on.
export const test = base.extend<{ pageErrors: string[] }>({
  pageErrors: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await use(errors);
  },
  page: async ({ page }, use) => {
    await page.clock.setFixedTime(MOCK_NOW);
    await use(page);
    await setScenarios(page, 'mixed', 'ok');
  },
});

export { expect };

// Shows every PR in the data: all authors, drafts included.
export const ALL = 'authors=all&draft=all';

export function rows(page: Page) {
  return page.locator('.board > tbody > tr');
}

// PR numbers of the visible rows, top to bottom.
export async function numbers(page: Page): Promise<number[]> {
  const cells = await page.locator('.board > tbody > tr > td.c-num').allTextContents();
  return cells.map((text) => Number(text.replace('#', '')));
}

// The current URL query as an object, for checks on the view state.
export function query(page: Page): Record<string, string> {
  return Object.fromEntries(new URL(page.url()).searchParams);
}
