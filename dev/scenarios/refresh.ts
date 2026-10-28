// How the GraphQL mock behind Refresh behaves.

import type { RawResponse } from '../../src/github/raw.ts';
import type { FixtureEntry } from '../fixtures/corner-cases.ts';
import { DEV_REPOSITORY } from '../fixtures/people.ts';
import { typicalNodes } from '../fixtures/typical.ts';
import { mixedEntries } from './entries.ts';
import type { GraphqlVariables, MockResponse, RefreshScenario } from './types.ts';

const SLOW_REFRESH_MS = 4000;
const SMALL_PAGE = 7;
const MISSING_PRS = 3;

function graphqlPage(entries: FixtureEntry[], variables: GraphqlVariables, { pageSize = variables.first, totalExtra = 0, projectsError = false } = {}): MockResponse {
  const offset = variables.after ? Number(variables.after) : 0;
  const slice = entries.slice(offset, offset + pageSize).map(({ node }) => (projectsError ? { ...node, projectsV2: null } : node));
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

export const REFRESH_SCENARIOS: RefreshScenario[] = [
  { id: 'ok', label: 'Success', respond: (v, now) => graphqlPage(mixedEntries(now), v) },
  { id: 'paginated', label: 'Success over several pages', respond: (v, now) => graphqlPage(mixedEntries(now), v, { pageSize: SMALL_PAGE }) },
  { id: 'projects-error', label: 'Partial error: projects forbidden', respond: (v, now) => graphqlPage(typicalNodes(now), v, { projectsError: true }) },
  { id: 'count-mismatch', label: 'Fewer PRs than totalCount', respond: (v, now) => graphqlPage(typicalNodes(now), v, { totalExtra: MISSING_PRS }) },
  { id: 'slow', label: 'Slow response (4 s)', respond: (v, now) => ({ ...graphqlPage(mixedEntries(now), v), delayMs: SLOW_REFRESH_MS }) },
  { id: 'unauthorized', label: '401 Bad credentials', respond: () => ({ status: 401, body: JSON.stringify({ message: 'Bad credentials' }) }) },
  { id: 'server-error', label: '502 from GitHub', respond: () => ({ status: 502, body: 'Server Error' }) },
  {
    id: 'repo-not-found',
    label: 'Repository not found',
    respond: () => ({
      status: 200,
      body: JSON.stringify({
        data: { repository: null },
        errors: [{ type: 'NOT_FOUND', path: ['repository'], message: "Could not resolve to a Repository with the name '" + DEV_REPOSITORY + "'." }],
      }),
    }),
  },
  { id: 'network', label: 'Network failure', respond: () => ({ destroy: true }) },
];
