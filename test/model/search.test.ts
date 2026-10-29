import { test } from 'node:test';
import assert from 'node:assert/strict';
import { derive } from '../../src/model/derive.ts';
import { activeLabelFilters, matchesQuery, parseQuery, toggleLabelFilter } from '../../src/model/search.ts';
import type { PullRequest } from '../../src/types.ts';

const NOW = Date.parse('2026-10-28T12:00:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;

// Fixtures fill only the fields a rule reads, so they are cast rather than built in full.
function pr(fields: Record<string, unknown> = {}): PullRequest {
  return {
    number: 1, title: 'feat: t', base: 'main', ci: 'passing', review: 'none', mergeable: 'clean', draft: false, author: { login: 'a', bot: false }, assignees: [],
    createdAt: new Date(NOW - DAY_MS).toISOString(), issues: [{ title: 'i' }], projects: [], comment: null,
    ...fields,
  } as unknown as PullRequest;
}

function search(query: string, fields: Record<string, unknown>) {
  return matchesQuery(derive(pr(fields), NOW), parseQuery(query));
}

test('FILTER-8 FILTER-9: search combines words and qualifiers, with negation and quotes', () => {
  const fields = {
    title: 'fix(ui): keep filters', labels: [{ name: 'module:ui' }, { name: 'good first issue' }],
    assignees: [{ login: 'Boris-K' }], reviewers: [{ login: 'chen-li', state: 'APPROVED' }], requestedReviewers: [{ login: 'anna-dev' }],
  };
  assert.ok(search('filters label:module:ui', fields));
  assert.ok(search('label:"good first issue"', fields));
  assert.ok(search('reviewer:anna-dev', fields));
  assert.ok(search('reviewer:chen area:fe -is:draft', fields));
  assert.ok(!search('-label:module:ui', fields));
  assert.ok(!search('area:be', fields));
  assert.ok(search('assignee:boris-k ci:pass', fields));
  assert.ok(search('no:issue', { issues: [] }));
});

test('FILTER-10: a qualifier still being typed does not hide everything', () => {
  assert.deepEqual(parseQuery('label:'), { filters: [], words: [] });
  assert.ok(search('label:', {}));
});

test('FILTER-10: unknown qualifiers are plain words', () => {
  assert.deepEqual(parseQuery('foo:bar').words, [{ value: 'foo:bar', negate: false }]);
});

test('FILTER-11: toggling a label removes it whatever its case or quoting, and leaves other labels alone', () => {
  assert.equal(toggleLabelFilter('label:Bug', 'bug'), '');
  assert.equal(toggleLabelFilter('label:bugfix label:bug', 'bug'), 'label:bugfix');
  assert.equal(toggleLabelFilter('label:"bug" ci:failing', 'bug'), 'ci:failing');
  assert.equal(toggleLabelFilter('-label:bug', 'bug'), '-label:bug label:bug');
  assert.equal(toggleLabelFilter('ci:failing', 'good first issue'), 'ci:failing label:"good first issue"');
});

test('FILTER-8: search finds a PR by the number of its linked issue', () => {
  const fields = { issues: [{ number: 885, title: '[FE] Show version publication errors in UI', url: 'u' }] };
  assert.ok(search('885', fields));
  assert.ok(search('#885', fields));
  assert.ok(!search('886', fields));
});

test('FILTER-11: chips are active for labels the search asks for, not for excluded ones', () => {
  const active = activeLabelFilters(parseQuery('label:Bug -label:wontfix label:"good first issue" ci:failing'));
  assert.deepEqual([...active], ['bug', 'good first issue']);
  assert.deepEqual([...activeLabelFilters(parseQuery(''))], []);
});

test('FILTER-15: repo: matches the repository name or owner/name, and plain words match it too', () => {
  const fields = { repo: 'acme/gadgets' };
  assert.ok(search('repo:gadgets', fields));
  assert.ok(search('repo:ACME/Gadgets', fields));
  assert.ok(!search('repo:widgets', fields));
  assert.ok(!search('-repo:acme/gadgets', fields));
  assert.ok(search('gadgets', fields));
});

test('NOTE-7: note: matches the text of any note, and -note: excludes it', () => {
  const fields = { standup: { askedToday: false, noteText: 'merged soon fix the tests' } };
  assert.ok(search('note:tests', fields));
  assert.ok(search('note:TESTS', fields));
  assert.ok(!search('note:deploy', fields));
  assert.ok(!search('-note:tests', fields));
  assert.ok(!search('note:tests', {}), 'a PR without notes does not match');
  assert.ok(search('-note:tests', {}));
});

test('FILTER-8: plain words match the type and labels of a linked issue', () => {
  const fields = { issues: [{ number: 5, title: 'Typed', url: 'u', type: { name: 'Bug', color: 'red' }, labels: [{ name: 'customer', color: null, description: '' }] }] };
  assert.ok(search('bug', fields));
  assert.ok(search('customer', fields));
  assert.ok(!search('feature', fields));
});
