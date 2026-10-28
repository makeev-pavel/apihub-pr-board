import { test } from 'node:test';
import assert from 'node:assert/strict';
import { derive } from '../../src/model/derive.ts';
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

test('derive computes age, ghost authors, and search text', () => {
  const result = derive(pr({ author: null, createdAt: new Date(NOW - 3 * DAY_MS - 1000).toISOString() }), NOW);
  assert.equal(result.ageDays, 3);
  assert.equal(result.authorKey, 'ghost');
  assert.ok(result.searchText.includes('#1'));
});
