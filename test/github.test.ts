import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMMENT_BODY_LIMIT, failedChecks, fetchAllComments, fetchOpenPullRequests, normalizeLabel, normalizePullRequest, recentComments, reviewState } from '../src/github.ts';
import type { RawPullRequest } from '../src/github.ts';
import { REFRESH_SCENARIOS } from '../dev/scenarios.ts';

const repository = { owner: 'acme', name: 'widgets' };

const baseNode: RawPullRequest = {
  number: 1,
  title: 't',
  url: 'u',
  isDraft: false,
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-02T00:00:00Z',
  baseRefName: 'main',
  mergeable: 'MERGEABLE',
  author: { __typename: 'User', login: 'a', avatarUrl: 'x' },
};

test('requested changes win over approvals', () => {
  const result = reviewState([
    { state: 'APPROVED', author: { login: 'a' } },
    { state: 'CHANGES_REQUESTED', author: { login: 'b' } },
  ]);
  assert.equal(result, 'changes_requested');
});

test('a dismissed review is not an approval', () => {
  assert.equal(reviewState([{ state: 'DISMISSED', author: { login: 'a' } }]), 'none');
});

test('recent comments mix issue comments and reviews, newest first, skipping empty bodies', () => {
  const list = recentComments(
    [{ createdAt: '2026-10-02T00:00:00Z', body: 'old', author: null }, { createdAt: '2026-10-04T00:00:00Z', body: '  ', author: null }],
    [{ submittedAt: '2026-10-03T00:00:00Z', body: 'review', url: 'r-url', author: { __typename: 'User', login: 'r', avatarUrl: null } }],
  );
  assert.deepEqual(list.map((c) => c.body), ['review', 'old']);
  assert.equal(list[0].author?.login, 'r');
  assert.equal(list[0].url, 'r-url');
});

test('comments that hold only HTML comment markers are skipped', () => {
  const list = recentComments(
    [{ createdAt: '2026-10-02T00:00:00Z', body: 'real', author: null }, { createdAt: '2026-10-04T00:00:00Z', body: '<!-- sonar:marker -->\n', author: null }],
    [],
  );
  assert.deepEqual(list.map((c) => c.body), ['real']);
});

test('long comment bodies are cut and marked', () => {
  const [comment] = recentComments([{ createdAt: '2026-10-02T00:00:00Z', body: 'x'.repeat(COMMENT_BODY_LIMIT + 10), author: null }], []);
  assert.equal(comment.truncated, true);
  assert.equal(comment.body.length, COMMENT_BODY_LIMIT + 1);
});

test('label colors are validated and lowercased', () => {
  assert.equal(normalizeLabel({ name: 'a', color: 'D4C5F9' }).color, 'd4c5f9');
  assert.equal(normalizeLabel({ name: 'a', color: 'red' }).color, null);
  assert.equal(normalizeLabel({ name: 'a', color: null }).description, '');
});

test('missing connections and null entries normalize to safe defaults', () => {
  const pr = normalizePullRequest({ ...baseNode, author: null, mergeable: null, assignees: { nodes: [null] }, commits: { nodes: [null] } });
  assert.equal(pr.author, null);
  assert.equal(pr.ci, 'none');
  assert.equal(pr.mergeable, 'unknown');
  assert.deepEqual(pr.assignees, []);
  assert.deepEqual(pr.issues, []);
  assert.deepEqual(pr.projects, []);
  assert.deepEqual(pr.comments, []);
  assert.deepEqual(pr.labels, []);
  assert.deepEqual(pr.requestedReviewers, []);
});

test('check rollup states map to CI states', () => {
  const ci = (state: string) => normalizePullRequest({ ...baseNode, commits: { nodes: [{ commit: { statusCheckRollup: { state } } }] } }).ci;
  assert.equal(ci('SUCCESS'), 'passing');
  assert.equal(ci('ERROR'), 'failing');
  assert.equal(ci('EXPECTED'), 'running');
});

test('bots are flagged from the GraphQL type name', () => {
  const pr = normalizePullRequest({ ...baseNode, author: { __typename: 'Bot', login: 'dependabot', avatarUrl: null } });
  assert.equal(pr.author?.bot, true);
});

// Run fetchOpenPullRequests against the dev mock scenarios, so the mock and the client stay in sync.
function mockFetch(scenarioId: string) {
  const scenario = REFRESH_SCENARIOS.find((s) => s.id === scenarioId)!;
  let calls = 0;
  const fetchImpl = async (_url: string, init: RequestInit) => {
    calls += 1;
    const result = scenario.respond(JSON.parse(String(init.body)).variables, Date.parse('2026-10-28T12:00:00Z'));
    if (result.destroy) throw new TypeError('Failed to fetch');
    return new Response(result.body, { status: result.status });
  };
  return { fetchImpl, calls: () => calls };
}

test('pagination collects every page', async () => {
  const single = await fetchOpenPullRequests({ token: 't', repository, fetchImpl: mockFetch('ok').fetchImpl });
  const paged = mockFetch('paginated');
  const report = await fetchOpenPullRequests({ token: 't', repository, fetchImpl: paged.fetchImpl });
  assert.ok(paged.calls() > 1);
  assert.equal(report.prs.length, single.prs.length);
  assert.deepEqual(report.warnings, []);
});

test('a forbidden projects field becomes a warning and unknown projects', async () => {
  const report = await fetchOpenPullRequests({ token: 't', repository, fetchImpl: mockFetch('projects-error').fetchImpl });
  assert.equal(report.warnings.length, 1);
  assert.ok(report.prs.every((pr) => pr.projects === null));
});

test('a short page against totalCount is reported', async () => {
  const report = await fetchOpenPullRequests({ token: 't', repository, fetchImpl: mockFetch('count-mismatch').fetchImpl });
  assert.match(report.warnings[0], /reported \d+ open pull requests but returned \d+/);
});

test('HTTP and GraphQL failures throw readable errors', async () => {
  await assert.rejects(fetchOpenPullRequests({ token: 't', repository, fetchImpl: mockFetch('unauthorized').fetchImpl }), { status: 401 });
  await assert.rejects(fetchOpenPullRequests({ token: 't', repository, fetchImpl: mockFetch('server-error').fetchImpl }), /HTTP 502/);
  await assert.rejects(fetchOpenPullRequests({ token: 't', repository, fetchImpl: mockFetch('repo-not-found').fetchImpl }), /at repository/);
  await assert.rejects(fetchOpenPullRequests({ token: 't', repository, fetchImpl: mockFetch('network').fetchImpl }), /Cannot reach api.github.com/);
  await assert.rejects(fetchOpenPullRequests({ token: '', repository }), /token is required/);
});

test('failed checks keep real failures and skip cancelled and passing runs', () => {
  const result = failedChecks({
    state: 'FAILURE',
    contexts: {
      totalCount: 5,
      pageInfo: { hasNextPage: false },
      nodes: [
        { __typename: 'CheckRun', name: 'lint', conclusion: 'FAILURE', detailsUrl: 'u', checkSuite: { workflowRun: { workflow: { name: 'Lint' } } } },
        { __typename: 'CheckRun', name: 'e2e', conclusion: 'TIMED_OUT', detailsUrl: null, checkSuite: null },
        { __typename: 'CheckRun', name: 'old', conclusion: 'CANCELLED', checkSuite: null },
        { __typename: 'CheckRun', name: 'unit', conclusion: 'SUCCESS', checkSuite: null },
        { __typename: 'StatusContext', context: 'sonar', state: 'ERROR', targetUrl: 's', description: 'gate failed' },
      ],
    },
  });
  assert.ok(result);
  assert.deepEqual(result.failed.map((c) => [c.name, c.workflow, c.conclusion]), [['lint', 'Lint', 'failure'], ['e2e', null, 'timed_out'], ['sonar', null, 'error']]);
  assert.equal(result.complete, true);
  assert.equal(failedChecks({ state: 'FAILURE' }), null);
});

test('checks are attached only to failing PRs', () => {
  const contexts = { totalCount: 0, pageInfo: { hasNextPage: false }, nodes: [] };
  const withRollup = (state: string) => normalizePullRequest({ ...baseNode, commits: { nodes: [{ commit: { statusCheckRollup: { state, contexts } } }] } });
  assert.deepEqual(withRollup('FAILURE').checks, { failed: [], total: 0, complete: true });
  assert.equal(withRollup('SUCCESS').checks, null);
});

test('hidden columns drop their parts of the query', async () => {
  const sent: Record<string, unknown>[] = [];
  const fetchImpl = async (_url: string, init: RequestInit) => {
    sent.push(JSON.parse(String(init.body)).variables);
    return mockFetch('ok').fetchImpl(_url, init);
  };
  await fetchOpenPullRequests({ token: 't', repository, fetchImpl });
  await fetchOpenPullRequests({ token: 't', repository, fetchImpl, parts: { checks: false, comments: false } });
  assert.deepEqual([sent[0].withChecks, sent[0].withComments], [true, true]);
  assert.deepEqual([sent.at(-1)!.withChecks, sent.at(-1)!.withComments], [false, false]);
});

const restUrl = 'https://api.test';
function restFetch(pages: Record<string, { body: unknown; status?: number; headers?: Record<string, string> }>) {
  const requested: { url: string; auth: string | undefined }[] = [];
  const fetchImpl = async (url: string, init: RequestInit) => {
    requested.push({ url, auth: (init.headers as Record<string, string>).Authorization });
    const page = pages[url] || { body: { message: 'Not Found' }, status: 404 };
    return new Response(JSON.stringify(page.body), { status: page.status || 200, headers: page.headers });
  };
  return { fetchImpl, requested };
}

test('all comments: issue comments and reviews merge newest first, across pages, without cutting', async () => {
  const comments = restUrl + '/repos/acme/widgets/issues/7/comments';
  const reviews = restUrl + '/repos/acme/widgets/pulls/7/reviews';
  const long = 'x'.repeat(COMMENT_BODY_LIMIT + 10);
  const { fetchImpl, requested } = restFetch({
    [comments + '?per_page=100']: {
      body: [{ created_at: '2026-10-01T00:00:00Z', body: 'first', html_url: 'c1', user: { login: 'a', avatar_url: 'https://avatars.test/u/1?v=4', type: 'User' } }],
      headers: { link: '<' + comments + '?per_page=100&page=2>; rel="next", <' + comments + '?per_page=100&page=2>; rel="last"' },
    },
    [comments + '?per_page=100&page=2']: { body: [{ created_at: '2026-10-03T00:00:00Z', body: long, user: { login: 'bot', type: 'Bot' } }] },
    [reviews + '?per_page=100']: { body: [{ submitted_at: '2026-10-02T00:00:00Z', body: 'review', user: { login: 'r' } }, { submitted_at: '2026-10-04T00:00:00Z', body: '', user: null }] },
  });
  const result = await fetchAllComments({ number: 7, repository, fetchImpl, restUrl });
  assert.deepEqual(result.comments.map((c) => c.body.slice(0, 6)), ['xxxxxx', 'review', 'first']);
  assert.equal(result.comments[0].body.length, COMMENT_BODY_LIMIT + 10);
  assert.equal(result.comments[0].author?.bot, true);
  assert.equal(result.comments[2].author?.avatarUrl, 'https://avatars.test/u/1?v=4&s=48');
  assert.equal(result.complete, true);
  assert.equal(requested.length, 3);
  assert.ok(requested.every((r) => r.auth === undefined));
});

test('all comments: the token is sent when there is one, and a used-up anonymous limit says to add a token', async () => {
  const limited = { body: { message: 'API rate limit exceeded' }, status: 403, headers: { 'x-ratelimit-remaining': '0' } };
  const comments = restUrl + '/repos/acme/widgets/issues/7/comments?per_page=100';
  const reviews = restUrl + '/repos/acme/widgets/pulls/7/reviews?per_page=100';
  const anonymous = restFetch({ [comments]: limited, [reviews]: { body: [] } });
  await assert.rejects(fetchAllComments({ number: 7, repository, fetchImpl: anonymous.fetchImpl, restUrl }), /Add a token in Settings/);
  const withToken = restFetch({ [comments]: { body: [] }, [reviews]: { body: [] } });
  await fetchAllComments({ number: 7, repository, token: 't', fetchImpl: withToken.fetchImpl, restUrl });
  assert.ok(withToken.requested.every((r) => r.auth === 'Bearer t'));
});
