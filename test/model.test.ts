import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  areasOf, attentionReasons, cleanCommentText, derive, isBot, matchesQuery, parseQuery, parseReport, STALE_DAYS, titleProblem, toggleLabelFilter,
} from '../src/model.ts';
import type { PullRequest } from '../src/types.ts';

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

test('valid Conventional Commits titles pass', () => {
  for (const title of ['feat: add x', 'fix(ui): y', 'feat(api)!: drop v1', 'chore: deps: bump nx in /', 'fix(ui-tests): Guard z', 'revert: undo x']) {
    assert.equal(titleProblem(title), null, title);
  }
});

test('invalid titles explain what is wrong', () => {
  assert.match(titleProblem('APIHUB-1234 Add export') ?? '', /expected "type\(scope\): subject"/);
  assert.match(titleProblem('fix(ui):no space') ?? '', /expected/);
  assert.match(titleProblem('Revert "feat: x"') ?? '', /expected/);
  assert.match(titleProblem('feature: add x') ?? '', /type "feature" is not allowed/);
  assert.match(titleProblem('Fix: crash') ?? '', /type "Fix" is not allowed/);
});

test('the age limit triggers only after the limit', () => {
  assert.deepEqual(attentionReasons(pr({}), STALE_DAYS), []);
  assert.equal(attentionReasons(pr({}), STALE_DAYS + 1).length, 1);
});

test('a PR in a project needs no linked issue', () => {
  assert.deepEqual(attentionReasons(pr({ issues: [], projects: ['Sprint'] }), 0), []);
  assert.deepEqual(attentionReasons(pr({ issues: [], projects: [] }), 0), ['No linked issue and not in a GitHub Project']);
});

test('unknown project membership is reported, not guessed', () => {
  assert.match(attentionReasons(pr({ issues: [], projects: null }), 0)[0], /could not be checked/);
});

test('service accounts and [bot] logins count as bots', () => {
  assert.equal(isBot({ login: 'acme-release-bot', avatarUrl: null, bot: false }, ['acme-release-bot']), true);
  assert.equal(isBot({ login: 'renovate[bot]', avatarUrl: null, bot: false }), true);
  assert.equal(isBot({ login: 'anna-dev', avatarUrl: null, bot: false }), false);
  assert.equal(isBot(null), false);
});

test('HTML comment markers are dropped from previews', () => {
  assert.equal(cleanCommentText('<!-- marker -->\n### AI review\n\nok'), '### AI review ok');
});

test('derive computes age, ghost authors, and search text', () => {
  const result = derive(pr({ author: null, createdAt: new Date(NOW - 3 * DAY_MS - 1000).toISOString() }), NOW);
  assert.equal(result.ageDays, 3);
  assert.equal(result.authorKey, 'ghost');
  assert.ok(result.searchText.includes('#1'));
});

test('areas come from module labels, the title scope, [FE]/[BE] tags, and frontend/backend paths', () => {
  assert.deepEqual(areasOf(pr({ labels: [{ name: 'module:portal-backend' }] })), ['be']);
  assert.deepEqual(areasOf(pr({ title: 'fix(api-doc-viewer): x' })), ['fe']);
  assert.deepEqual(areasOf(pr({ title: 'fix: [BE] x', issues: [{ title: '[FE] y' }] })), ['be', 'fe']);
  assert.deepEqual(areasOf(pr({ title: 'chore: deps: bump x in /backend/agent' })), ['be']);
  assert.deepEqual(areasOf(pr({ title: 'chore: deps: bump x in /', labels: [{ name: 'module:ci' }] })), []);
});

function search(query: string, fields: Record<string, unknown>) {
  return matchesQuery(derive(pr(fields), NOW), parseQuery(query));
}

test('search combines words and qualifiers, with negation and quotes', () => {
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

test('a qualifier still being typed does not hide everything', () => {
  assert.deepEqual(parseQuery('label:'), { filters: [], words: [] });
  assert.ok(search('label:', {}));
});

test('unknown qualifiers are plain words', () => {
  assert.deepEqual(parseQuery('foo:bar').words, [{ value: 'foo:bar', negate: false }]);
});

test('toggling a label removes it whatever its case or quoting, and leaves other labels alone', () => {
  assert.equal(toggleLabelFilter('label:Bug', 'bug'), '');
  assert.equal(toggleLabelFilter('label:bugfix label:bug', 'bug'), 'label:bugfix');
  assert.equal(toggleLabelFilter('label:"bug" ci:failing', 'bug'), 'ci:failing');
  assert.equal(toggleLabelFilter('-label:bug', 'bug'), '-label:bug label:bug');
  assert.equal(toggleLabelFilter('ci:failing', 'good first issue'), 'ci:failing label:"good first issue"');
});

test('prs.json without a PR list is rejected, and missing optional fields get defaults', () => {
  assert.throws(() => parseReport({}), /no list of pull requests/);
  assert.throws(() => parseReport(null), /no list of pull requests/);
  const report = parseReport({ repo: 'a/b', generatedAt: '2026-10-28T12:00:00Z', prs: [] });
  assert.deepEqual(report.warnings, []);
  assert.equal(report.runUrl, null);
});

test('search finds a PR by the number of its linked issue', () => {
  const fields = { issues: [{ number: 885, title: '[FE] Show version publication errors in UI', url: 'u' }] };
  assert.ok(search('885', fields));
  assert.ok(search('#885', fields));
  assert.ok(!search('886', fields));
});
