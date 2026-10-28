// Mock scenarios for the dev server: what /prs.json returns, and how the GraphQL mock behind Refresh behaves.

import { normalizePullRequest } from '../src/github/normalize.ts';
import type { RawActor, RawResponse, RestComment, RestReview } from '../src/github/raw.ts';
import type { Report } from '../src/types.ts';
import { cornerCaseNodes } from './fixtures/corner-cases.ts';
import type { FixtureEntry } from './fixtures/corner-cases.ts';
import { DEV_REPOSITORY } from './fixtures/people.ts';
import { typicalNodes } from './fixtures/typical.ts';
const DAY_MS = 24 * 60 * 60 * 1000;
const MANY_PRS = 300;
const STALE_SNAPSHOT_DAYS = 3;
const SLOW_REPORT_MS = 3000;
const SLOW_REFRESH_MS = 4000;
const SMALL_PAGE = 7;
const MISSING_PRS = 3;

// How the mock answers: an HTTP status and body, optionally after a delay, or a dropped connection.
export type MockResponse =
  | { status: number; body: string; delayMs?: number; destroy?: false }
  | { destroy: true; delayMs?: number };

export interface GraphqlVariables {
  first: number;
  after: string | null;
}

export interface ReportScenario {
  id: string;
  label: string;
  respond: (now: number) => MockResponse;
}

export interface RefreshScenario {
  id: string;
  label: string;
  respond: (variables: GraphqlVariables, now: number) => MockResponse;
}

function mixedEntries(now: number): FixtureEntry[] {
  return typicalNodes(now).concat(cornerCaseNodes(now));
}

function manyEntries(now: number): FixtureEntry[] {
  const base = mixedEntries(now);
  return Array.from({ length: MANY_PRS }, (_, i) => {
    const source = base[i % base.length].node;
    return { node: { ...source, number: 20000 + i, title: source.title + ' (copy ' + (i + 1) + ')' }, note: null };
  });
}

function report(entries: FixtureEntry[], { now, warnings = [], projectsAvailable = true, generatedAt = now }: {
  now: number;
  warnings?: string[];
  projectsAvailable?: boolean;
  generatedAt?: number;
}): Report {
  return {
    repo: DEV_REPOSITORY,
    generatedAt: new Date(generatedAt).toISOString(),
    runUrl: null,
    warnings,
    prs: entries.map(({ node, note }) => {
      const pr = normalizePullRequest(node, { projectsAvailable });
      return note ? { ...pr, example: true, note } : pr;
    }),
  };
}

const json = (body: unknown, extra: { delayMs?: number } = {}): MockResponse => ({ status: 200, body: JSON.stringify(body), ...extra });

export const REPORT_SCENARIOS: ReportScenario[] = [
  { id: 'mixed', label: 'Typical board + corner cases', respond: (now) => json(report(mixedEntries(now), { now })) },
  { id: 'typical', label: 'Typical board only', respond: (now) => json(report(typicalNodes(now), { now })) },
  { id: 'corner', label: 'Corner cases only', respond: (now) => json(report(cornerCaseNodes(now), { now })) },
  { id: 'empty', label: 'No open PRs', respond: (now) => json(report([], { now })) },
  { id: 'many', label: MANY_PRS + ' PRs', respond: (now) => json(report(manyEntries(now), { now })) },
  {
    id: 'projects-unavailable',
    label: 'Project data unavailable',
    respond: (now) => json(report(typicalNodes(now), {
      now,
      projectsAvailable: false,
      warnings: ['Project membership is unavailable for this token: Resource not accessible by integration'],
    })),
  },
  {
    id: 'stale',
    label: 'Snapshot ' + STALE_SNAPSHOT_DAYS + ' days old',
    respond: (now) => json(report(mixedEntries(now), { now, generatedAt: now - STALE_SNAPSHOT_DAYS * DAY_MS })),
  },
  { id: 'slow', label: 'Slow load (3 s)', respond: (now) => json(report(mixedEntries(now), { now }), { delayMs: SLOW_REPORT_MS }) },
  { id: 'missing', label: 'prs.json missing (404)', respond: () => ({ status: 404, body: 'Not found' }) },
  { id: 'broken', label: 'prs.json is not valid JSON', respond: () => ({ status: 200, body: '{"repo": "' + DEV_REPOSITORY + '", "prs": [' }) },
  { id: 'wrong-shape', label: 'prs.json without a PR list', respond: () => json({ repo: DEV_REPOSITORY }) },
];

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

function restUser(actor: RawActor | null | undefined) {
  return actor ? { login: actor.login, avatar_url: actor.avatarUrl || null, type: actor.__typename === 'Bot' ? 'Bot' : 'User' } : null;
}

// The REST answers behind the comments panel: every comment and review of a mock PR, or null when it does not exist.
export function restComments(number: number, now: number): { comments: RestComment[]; reviews: RestReview[] } | null {
  const entry = mixedEntries(now).find(({ node }) => node.number === number);
  if (!entry) return null;
  const list = <T>(connection: { nodes?: (T | null)[] | null } | null | undefined) => ((connection && connection.nodes) || []).filter((n): n is T => n !== null);
  return {
    comments: list(entry.node.comments).map((c) => ({ created_at: c.createdAt, body: c.body, html_url: c.url, user: restUser(c.author) })),
    reviews: list(entry.node.reviews).map((r) => ({ submitted_at: r.submittedAt, body: r.body, html_url: r.url, user: restUser(r.author) })),
  };
}
