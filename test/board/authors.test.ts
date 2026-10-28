import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authorsSummary, collectAuthors, selectedAuthors, toggleAuthor } from '../../src/board/authors.ts';
import type { AuthorEntry } from '../../src/board/authors.ts';
import type { DerivedPullRequest } from '../../src/types.ts';

const pr = (authorKey: string, bot = false) =>
  ({ authorKey, author: authorKey === 'ghost' ? null : { login: authorKey, avatarUrl: null, bot }, bot }) as DerivedPullRequest;

const AUTHORS: AuthorEntry[] = [
  { login: 'anna-dev', actor: null, bot: false, count: 2 },
  { login: 'boris-k', actor: null, bot: false, count: 1 },
  { login: 'dependabot', actor: null, bot: true, count: 3 },
];

test('FILTER-3: authors are counted once each and sorted without regard to case', () => {
  // Plain string order would put "Boris-K" before "anna-dev".
  const authors = collectAuthors([pr('Boris-K'), pr('anna-dev'), pr('Boris-K'), pr('dependabot', true), pr('ghost')]);
  assert.deepEqual(authors.map((a) => [a.login, a.count, a.bot]), [['anna-dev', 1, false], ['Boris-K', 2, false], ['dependabot', 1, true], ['ghost', 1, false]]);
  assert.deepEqual(collectAuthors([]), []);
});

test('FILTER-3: People leaves out bots, and Bots and Everyone pick their sets', () => {
  assert.deepEqual([...selectedAuthors(null, AUTHORS)], ['anna-dev', 'boris-k']);
  assert.deepEqual([...selectedAuthors('bots', AUTHORS)], ['dependabot']);
  assert.deepEqual([...selectedAuthors('all', AUTHORS)], ['anna-dev', 'boris-k', 'dependabot']);
  assert.deepEqual([...selectedAuthors([], AUTHORS)], []);
});

test('FILTER-4: a chosen author without PRs in the data is left out of the selection', () => {
  assert.deepEqual([...selectedAuthors(['boris-k', 'gone-person'], AUTHORS)], ['boris-k']);
});

test('FILTER-3: the Authors button names the choice', () => {
  assert.equal(authorsSummary(null, new Set()), 'People');
  assert.equal(authorsSummary('all', new Set()), 'Everyone');
  assert.equal(authorsSummary('bots', new Set()), 'Bots');
  assert.equal(authorsSummary([], new Set()), 'Nobody');
  assert.equal(authorsSummary(['boris-k'], new Set(['boris-k'])), 'boris-k');
  assert.equal(authorsSummary(['anna-dev', 'boris-k'], new Set(['anna-dev', 'boris-k'])), '2 selected');
});

test('FILTER-4: checking or unchecking an author keeps a list, or becomes the preset it equals', () => {
  const people = new Set(['anna-dev', 'boris-k']);
  assert.deepEqual(toggleAuthor('boris-k', people, AUTHORS), ['anna-dev']);
  assert.equal(toggleAuthor('boris-k', new Set(['anna-dev']), AUTHORS), null);
  assert.equal(toggleAuthor('dependabot', people, AUTHORS), 'all');
  assert.equal(toggleAuthor('dependabot', new Set(), AUTHORS), 'bots');
  assert.deepEqual(toggleAuthor('anna-dev', new Set(['anna-dev']), AUTHORS), []);
});
