import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseReport, pullRequestKey } from '../../src/model/report.ts';
import type { PullRequest } from '../../src/types.ts';

test('DATA-5: prs.json without a PR list is rejected, and missing optional fields get defaults', () => {
  assert.throws(() => parseReport({}), /no list of pull requests/);
  assert.throws(() => parseReport(null), /no list of pull requests/);
  const report = parseReport({ repo: 'a/b', generatedAt: '2026-10-28T12:00:00Z', prs: [] });
  assert.deepEqual(report.warnings, []);
  assert.equal(report.runUrl, null);
});

test('DATA-5: optional fields of prs.json keep valid values and drop invalid ones', () => {
  const report = parseReport({ repo: 7, runUrl: 'https://example.test/run/1', warnings: ['ok', 3, null], prs: [] });
  assert.deepEqual(report.repos, []);
  assert.equal(report.runUrl, 'https://example.test/run/1');
  assert.deepEqual(report.warnings, ['ok']);
  assert.equal(report.generatedAt, new Date(0).toISOString());
});

test('DATA-19: prs.json lists its repositories, and each PR keeps its own', () => {
  const report = parseReport({
    repos: ['acme/widgets', 'acme/gadgets', 7, '../x'],
    prs: [{ number: 1, repo: 'acme/widgets' }, { number: 1, repo: 'acme/gadgets' }],
  });
  assert.deepEqual(report.repos, ['acme/widgets', 'acme/gadgets']);
  assert.deepEqual(report.prs.map((pr) => pr.repo), ['acme/widgets', 'acme/gadgets']);
});

test('DATA-19: a file from before, with one repository and PRs without one, gives its PRs that repository', () => {
  const report = parseReport({ repo: 'acme/widgets', prs: [{ number: 1 }, { number: 2, repo: '../../user' }] });
  assert.deepEqual(report.repos, ['acme/widgets']);
  assert.deepEqual(report.prs.map((pr) => pr.repo), ['acme/widgets', 'acme/widgets']);
});

test('DATA-19: with several repositories, a PR without a valid one gets none', () => {
  const report = parseReport({ repos: ['acme/widgets', 'acme/gadgets'], prs: [{ number: 1, repo: 'nope' }] });
  assert.equal(report.prs[0].repo, '');
});

test('DATA-20: equal numbers in different repositories are different PRs', () => {
  const pr = (repo: string, number: number) => ({ repo, number }) as PullRequest;
  assert.notEqual(pullRequestKey(pr('acme/widgets', 7)), pullRequestKey(pr('acme/gadgets', 7)));
  assert.equal(pullRequestKey(pr('acme/widgets', 7)), pullRequestKey(pr('acme/widgets', 7)));
  assert.notEqual(pullRequestKey(pr('acme/widgets', 7)), pullRequestKey(pr('acme/widgets', 70)));
});

test('DATA-19: a PR naming a repository the file does not list gets the file repository', () => {
  const report = parseReport({ repos: ['acme/widgets'], prs: [{ number: 1, repo: 'other/x' }, { number: 2, repo: 'ACME/Widgets' }] });
  assert.deepEqual(report.prs.map((pr) => pr.repo), ['acme/widgets', 'ACME/Widgets']);
});

test('DATA-5: entries that are not PRs with a positive whole number are skipped', () => {
  const report = parseReport({ repo: 'acme/widgets', prs: [null, 'x', { number: '7' }, { number: 0 }, { number: 1.5 }, { number: '../7' }, { number: 7 }] });
  assert.deepEqual(report.prs.map((pr) => pr.number), [7]);
});

test('DATA-5: a PR whose lists are missing or broken gets empty lists, so it renders', () => {
  const [pr] = parseReport({ repo: 'acme/widgets', prs: [{ number: 7, assignees: null, labels: 'bug', issues: undefined, projects: 'x' }] }).prs;
  for (const field of ['assignees', 'labels', 'reviewers', 'requestedReviewers', 'issues', 'comments'] as const) {
    assert.deepEqual(pr[field], [], field);
  }
  assert.equal(pr.projects, null, 'unreadable projects count as unknown');
  const [kept] = parseReport({ repo: 'acme/widgets', prs: [{ number: 8, labels: [{ name: 'bug' }], projects: ['Sprint'] }] }).prs;
  assert.deepEqual(kept.labels, [{ name: 'bug' }]);
  assert.deepEqual(kept.projects, ['Sprint']);
});

test('DATA-5: issues in a prs.json written before types and labels get none', () => {
  const [pr] = parseReport({ repo: 'acme/widgets', prs: [{ number: 7, issues: [{ number: 1, title: 'Old', url: 'u' }, { number: 2, title: 'Odd', url: 'u', type: 'Bug', labels: 'x' }] }] }).prs;
  assert.deepEqual(pr.issues.map((i) => [i.type, i.labels]), [[null, []], [null, []]]);
});

test('DATA-5 DATA-25: issues in a prs.json written before the project fields get none', () => {
  const [pr] = parseReport({ repo: 'acme/widgets', prs: [{ number: 7, issues: [{ number: 1, title: 'Old', url: 'u', estimate: '3', sprint: 'S' }] }] }).prs;
  assert.deepEqual([pr.issues[0].priority, pr.issues[0].estimate, pr.issues[0].sprint], [null, null, null]);
});
