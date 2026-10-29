import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boardColumns, COLUMNS, DEFAULT_WIDTHS, fitToWidth, isColumnShown } from '../../src/board/columns.ts';

const sum = (widths: Record<string, number>, ids: string[]) => ids.reduce((total, id) => total + widths[id], 0);
const ALL_IDS = COLUMNS.map((c) => c.id);

test('TABLE-22: spare width goes to Pull request and Last comment, so the table fills the window', () => {
  const total = sum(DEFAULT_WIDTHS, ALL_IDS);
  const fitted = fitToWidth(DEFAULT_WIDTHS, total + 101, null, COLUMNS);
  assert.equal(sum(fitted, ALL_IDS), total + 101);
  assert.equal(fitted.title - DEFAULT_WIDTHS.title + fitted.comment - DEFAULT_WIDTHS.comment, 101);
  assert.equal(fitted.author, DEFAULT_WIDTHS.author);
});

test('TABLE-22: wider columns than the window are left as they are, and so is an unknown width', () => {
  assert.equal(fitToWidth(DEFAULT_WIDTHS, 500, null, COLUMNS), DEFAULT_WIDTHS);
  assert.equal(fitToWidth(DEFAULT_WIDTHS, 0, null, COLUMNS), DEFAULT_WIDTHS);
});

test('TABLE-22 TABLE-24: the column being resized keeps its width, and the last column fills in when no flexible one can', () => {
  const total = sum(DEFAULT_WIDTHS, ALL_IDS);
  const resizing = fitToWidth(DEFAULT_WIDTHS, total + 40, 'title', COLUMNS);
  assert.equal(resizing.title, DEFAULT_WIDTHS.title);
  assert.equal(resizing.comment, DEFAULT_WIDTHS.comment + 40);
  const shown = COLUMNS.filter((c) => !['comment', 'attention', 'notes'].includes(c.id));
  const lastOnly = fitToWidth(DEFAULT_WIDTHS, sum(DEFAULT_WIDTHS, shown.map((c) => c.id)) + 30, 'title', shown);
  assert.equal(lastOnly.assignee, DEFAULT_WIDTHS.assignee + 30);
});

test('TABLE-5: # and Pull request are always shown; other columns follow the hidden list', () => {
  const byId = (id: string) => COLUMNS.find((c) => c.id === id)!;
  assert.equal(isColumnShown(byId('number'), ['number']), true);
  assert.equal(isColumnShown(byId('title'), ['title']), true);
  assert.equal(isColumnShown(byId('ci'), ['ci']), false);
  assert.equal(isColumnShown(byId('ci'), []), true);
});

test('TABLE-26: the Repository column comes first, and only with more than one repository', () => {
  const ids = (repoCount: number) => boardColumns(repoCount).map((c) => c.id);
  assert.equal(ids(0).includes('repo'), false);
  assert.equal(ids(1).includes('repo'), false);
  assert.deepEqual(ids(1), COLUMNS.filter((c) => c.id !== 'repo').map((c) => c.id));
  assert.equal(ids(2)[0], 'repo');
  assert.equal(ids(2).length, COLUMNS.length);
  const repo = COLUMNS.find((c) => c.id === 'repo')!;
  assert.equal(repo.required, undefined, 'the column can be hidden');
  assert.equal(isColumnShown(repo, ['repo']), false);
});
