// How the GraphQL mock behind Refresh behaves.

import type { RawResponse } from '../../src/github/raw.ts';
import type { FixtureEntry } from '../fixtures/builders.ts';
import { gadgetsEntries } from '../fixtures/gadgets.ts';
import { DEV_REPOSITORY, FORBIDDEN_REPOSITORY, GADGETS_REPOSITORY } from '../fixtures/people.ts';
import { typicalNodes } from '../fixtures/typical.ts';
import { mixedEntries } from './entries.ts';
import type { GraphqlVariables, MockResponse, RefreshScenario } from './types.ts';

const SLOW_REFRESH_MS = 4000;
const SMALL_PAGE = 7;
const MISSING_PRS = 3;

function graphqlPage(entries: FixtureEntry[], variables: GraphqlVariables, { pageSize = variables.first, totalExtra = 0, projectsError = false } = {}): MockResponse {
  const offset = variables.after ? Number(variables.after) : 0;
  // Like GitHub, the mock leaves out what the query's @include switches off.
  const withoutFields = (node: FixtureEntry['node']) => (variables.withProjectFields === false && node.closingIssuesReferences
    ? { ...node, closingIssuesReferences: { nodes: (node.closingIssuesReferences.nodes || []).map((issue) => (issue ? { ...issue, projectItems: undefined } : issue)) } }
    : node);
  const slice = entries.slice(offset, offset + pageSize)
    .map(({ node }) => withoutFields(projectsError ? { ...node, projectsV2: null } : node));
  const next = offset + slice.length;
  const body: RawResponse = {
    data: {
      repository: {
        pullRequests: {
          totalCount: entries.length + totalExtra,
          pageInfo: { hasNextPage: next < entries.length, endCursor: next < entries.length ? String(next) : null },
          nodes: slice,
        },
      },
    },
  };
  if (projectsError && slice.length) {
    body.errors = slice.map((_, i) => ({
      type: 'FORBIDDEN',
      path: ['repository', 'pullRequests', 'nodes', i, 'projectsV2'],
      message: 'Resource not accessible by integration',
    }));
  }
  return { status: 200, body: JSON.stringify(body) };
}

function notFound(variables: GraphqlVariables): MockResponse {
  const name = variables.owner + '/' + variables.repo;
  return {
    status: 200,
    body: JSON.stringify({
      data: { repository: null },
      errors: [{ type: 'NOT_FOUND', path: ['repository'], message: "Could not resolve to a Repository with the name '" + name + "'." }],
    }),
  };
}

function forbidden(): MockResponse {
  return {
    status: 200,
    body: JSON.stringify({
      data: { repository: null },
      errors: [{ type: 'FORBIDDEN', path: ['repository'], message: 'Resource protected by organization SAML enforcement.' }],
    }),
  };
}

// The scenario's PRs for the mock repository, the gadgets PRs for the second one, FORBIDDEN for the private one, and
// NOT_FOUND for any other. Names compare without case, as on GitHub.
function board(widgets: (now: number) => FixtureEntry[], options: Parameters<typeof graphqlPage>[2] = {}) {
  return (variables: GraphqlVariables, now: number): MockResponse => {
    const name = (variables.owner + '/' + variables.repo).toLowerCase();
    if (name === DEV_REPOSITORY) return graphqlPage(widgets(now), variables, options);
    if (name === GADGETS_REPOSITORY) return graphqlPage(gadgetsEntries(now), variables, options);
    return name === FORBIDDEN_REPOSITORY ? forbidden() : notFound(variables);
  };
}

const ok = board(mixedEntries);

export const REFRESH_SCENARIOS: RefreshScenario[] = [
  { id: 'ok', label: 'Success', respond: ok },
  { id: 'paginated', label: 'Success over several pages', respond: board(mixedEntries, { pageSize: SMALL_PAGE }) },
  { id: 'projects-error', label: 'Partial error: projects forbidden', respond: board(typicalNodes, { projectsError: true }) },
  { id: 'count-mismatch', label: 'Fewer PRs than totalCount', respond: board(typicalNodes, { totalExtra: MISSING_PRS }) },
  // Only the first page waits, so the delay stays 4 s however many pages the board takes.
  { id: 'slow', label: 'Slow response (4 s)', respond: (v, now) => ({ ...ok(v, now), delayMs: v.after ? 0 : SLOW_REFRESH_MS }) },
  { id: 'unauthorized', label: '401 Bad credentials', respond: () => ({ status: 401, body: JSON.stringify({ message: 'Bad credentials' }) }) },
  { id: 'server-error', label: '502 from GitHub', respond: () => ({ status: 502, body: 'Server Error' }) },
  { id: 'repo-not-found', label: 'Repository not found', respond: notFound },
  { id: 'network', label: 'Network failure', respond: () => ({ destroy: true }) },
];
