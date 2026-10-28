import { test } from 'node:test';
import assert from 'node:assert/strict';
import { areasOf } from '../../src/model/areas.ts';
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

test('RULE-11: areas come from module labels, the title scope, [FE]/[BE] tags, and frontend/backend paths', () => {
  assert.deepEqual(areasOf(pr({ labels: [{ name: 'module:portal-backend' }] })), ['be']);
  assert.deepEqual(areasOf(pr({ title: 'fix(api-doc-viewer): x' })), ['fe']);
  assert.deepEqual(areasOf(pr({ title: 'fix: [BE] x', issues: [{ title: '[FE] y' }] })), ['be', 'fe']);
  assert.deepEqual(areasOf(pr({ title: 'chore: deps: bump x in /backend/agent' })), ['be']);
  assert.deepEqual(areasOf(pr({ title: 'chore: deps: bump x in /', labels: [{ name: 'module:ci' }] })), []);
});
