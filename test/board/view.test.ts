import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_VIEW, filterPullRequests, firstDirection, parseView, readView, viewQuery, visibleRows, writeView,
} from '../../src/board/view.ts';
import { parseQuery } from '../../src/model/search.ts';
import type { DerivedPullRequest } from '../../src/types.ts';

function pr(number: number, fields: Partial<DerivedPullRequest> = {}): DerivedPullRequest {
  return {
    number, title: 'PR ' + number, authorKey: 'anna-dev', draft: false, areas: [], ci: 'passing', review: 'none',
    mergeable: 'clean', createdAt: '2026-10-01T00:00:00Z', attention: [], searchText: 'pr ' + number, ...fields,
  } as DerivedPullRequest;
}

test('FILTER-13: a URL query restores the view, and unknown values fall back to the defaults', () => {
  assert.deepEqual(parseView(''), DEFAULT_VIEW);
  assert.deepEqual(parseView('?q=fix&authors=anna-dev,,boris-k&draft=draft&area=fe&quick=ci,nope&sort=title&dir=asc'), {
    q: 'fix', authors: ['anna-dev', 'boris-k'], draft: 'draft', area: 'fe', quick: ['ci'], sort: 'title', dir: 'asc',
  });
  assert.equal(parseView('?authors=bots').authors, 'bots');
  assert.equal(parseView('?q=%20label:bug%20').q, ' label:bug ', 'the search is kept as typed');
  assert.deepEqual(parseView('?draft=weird&area=moon&sort=nope&dir=up'), DEFAULT_VIEW);
});

test('FILTER-13: the default view has an empty query, and a view survives the round trip', () => {
  assert.equal(viewQuery(DEFAULT_VIEW), '');
  const view = { ...DEFAULT_VIEW, q: 'label:"good first issue"', authors: ['anna-dev'], area: 'be' as const, quick: ['ci', 'review'] };
  assert.deepEqual(parseView('?' + viewQuery(view)), view);
  assert.equal(viewQuery({ ...DEFAULT_VIEW, dir: 'asc' }), 'sort=attention&dir=asc');
});

test('TABLE-16: text columns sort A to Z first, the others highest first', () => {
  assert.equal(firstDirection('title'), 'asc');
  assert.equal(firstDirection('author'), 'asc');
  assert.equal(firstDirection('age'), 'desc');
  assert.equal(firstDirection('number'), 'desc');
});

test('FILTER-5 FILTER-6: authors, draft status, area, and the search narrow the rows', () => {
  const prs = [pr(1), pr(2, { draft: true }), pr(3, { areas: ['be'] }), pr(4, { authorKey: 'boris-k' }), pr(5, { areas: ['be', 'fe'] })];
  const everyone = new Set(['anna-dev', 'boris-k']);
  const ids = (list: DerivedPullRequest[]) => list.map((p) => p.number);
  const query = parseQuery('');
  assert.deepEqual(ids(filterPullRequests(prs, { draft: 'all', area: 'all' }, everyone, query)), [1, 2, 3, 4, 5]);
  assert.deepEqual(ids(filterPullRequests(prs, { draft: 'ready', area: 'all' }, everyone, query)), [1, 3, 4, 5]);
  assert.deepEqual(ids(filterPullRequests(prs, { draft: 'draft', area: 'all' }, everyone, query)), [2]);
  assert.deepEqual(ids(filterPullRequests(prs, { draft: 'all', area: 'fe' }, everyone, query)), [5]);
  assert.deepEqual(ids(filterPullRequests(prs, { draft: 'all', area: 'other' }, everyone, query)), [1, 2, 4]);
  assert.deepEqual(ids(filterPullRequests(prs, { draft: 'all', area: 'all' }, new Set(['boris-k']), query)), [4]);
  assert.deepEqual(ids(filterPullRequests(prs, { draft: 'all', area: 'all' }, everyone, parseQuery('pr 3'))), [3]);
});

test('FILTER-2 TABLE-17 TABLE-18: quick filters combine with AND, then rows sort with ties newest first', () => {
  const prs = [
    pr(1, { ci: 'failing', attention: ['a'] }), pr(2, { ci: 'failing', review: 'approved' }), pr(3, { attention: ['a', 'b'] }),
    pr(4, { ci: 'running', attention: ['a'] }),
  ];
  const ids = (list: DerivedPullRequest[]) => list.map((p) => p.number);
  assert.deepEqual(ids(visibleRows(prs, { quick: [], sort: 'attention', dir: 'desc' })), [3, 4, 1, 2]);
  assert.deepEqual(ids(visibleRows(prs, { quick: ['ci'], sort: 'number', dir: 'asc' })), [1, 2]);
  assert.deepEqual(ids(visibleRows(prs, { quick: ['ci', 'review'], sort: 'number', dir: 'asc' })), [1]);
  assert.deepEqual(ids(visibleRows(prs, { quick: [], sort: 'ci', dir: 'asc' })), [2, 1, 4, 3]);
  assert.deepEqual(visibleRows([], { quick: ['ci'], sort: 'number', dir: 'asc' }), []);
});

test('FILTER-13: the page reads the view from its address and writes it back without a reload', () => {
  const calls: string[] = [];
  Object.assign(globalThis, {
    window: { location: { search: '?area=fe', pathname: '/board/' } },
    history: { replaceState: (_state: unknown, _title: string, url: string) => { calls.push(url); } },
  });
  assert.equal(readView().area, 'fe');
  writeView({ ...DEFAULT_VIEW, q: 'fix' });
  writeView(DEFAULT_VIEW);
  assert.deepEqual(calls, ['/board/?q=fix', '/board/']);
  delete (globalThis as { window?: unknown }).window;
  delete (globalThis as { history?: unknown }).history;
});
