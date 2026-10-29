// Reads every open pull request through the GraphQL API, page by page.

import { repositoryName } from '../repository.ts';
import type { Repository } from '../repository.ts';
import type { PullRequest, Report } from '../types.ts';
import { GitHubError } from './http.ts';
import type { Fetch } from './http.ts';
import { nodes, normalizePullRequest } from './normalize.ts';
import {
  ALL_PARTS, AVATAR_SIZE, CHECKS_PAGE_SIZE, COMMENTS_FETCHED, MIN_PAGE_SIZE, OPEN_PULL_REQUESTS_QUERY, PAGE_SIZE, PROJECT_FIELDS,
  PROJECT_ITEMS,
} from './query.ts';
import type { QueryParts } from './query.ts';
import type { RawPullRequest, RawResponse } from './raw.ts';

export const GRAPHQL_URL = 'https://api.github.com/graphql';

export interface FetchOptions {
  token: string;
  repositories: Repository[];
  parts?: QueryParts;
  fetchImpl?: Fetch;
  endpoint?: string;
}

async function postQuery(fetchImpl: Fetch, endpoint: string, token: string, variables: Record<string, unknown>): Promise<RawResponse> {
  let response: Response;
  try {
    response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: OPEN_PULL_REQUESTS_QUERY, variables }),
    });
  } catch (error) {
    throw new GitHubError('Cannot reach api.github.com: ' + (error as Error).message, 0);
  }
  if (response.status === 401) {
    throw new GitHubError('GitHub rejected the token. Create a new token and try again.', 401);
  }
  if (!response.ok) {
    const text = await response.text();
    throw new GitHubError('GitHub API returned HTTP ' + response.status + ': ' + text.slice(0, 300), response.status);
  }
  try {
    return await response.json();
  } catch {
    throw new GitHubError('GitHub API returned a response that is not JSON.', response.status);
  }
}

interface RepositoryPullRequests {
  repo: string;
  prs: PullRequest[];
  warnings: string[];
}

type ReadOptions = Required<Omit<FetchOptions, 'repositories'>>;

const TIMEOUT_STATUSES = new Set([0, 502, 503, 504]);

// GitHub answers a repository it cannot give with null and errors at "repository": NOT_FOUND when it does not exist or
// the token cannot see it, FORBIDDEN when the organization blocks the token (SAML, for one). Returns the warning.
function unreadableRepository(body: RawResponse, repo: string): string | null {
  const errors = body.errors || [];
  const atRepository = errors.length > 0 && errors.every((error) => (error.path || []).join('.') === 'repository');
  if ((body.data && body.data.repository) || !atRepository) return null;
  if (errors.every((error) => error.type === 'NOT_FOUND')) return 'Repository ' + repo + ' was not found, or the token cannot read it.';
  return 'Repository ' + repo + ' cannot be read with this token: ' + errors[0].message;
}

function graphqlError(error: NonNullable<RawResponse['errors']>[number]): GitHubError {
  const path = (error.path || []).join('.');
  return new GitHubError('GitHub GraphQL error' + (path ? ' at ' + path : '') + ': ' + error.message, 200);
}

// Partial GraphQL errors on optional fields (projects need extra token scopes) become warnings, not a failed report.
// With several repositories, one that cannot be read gives its warning instead of failing.
async function readRepository(repository: Repository, several: boolean, options: ReadOptions): Promise<RepositoryPullRequests | { unreadable: string }> {
  const { token, parts, fetchImpl, endpoint } = options;
  const repo = repositoryName(repository);
  const rawNodes: RawPullRequest[] = [];
  const warnings = new Set<string>();
  let projectsAvailable = true;
  let after: string | null = null;
  let totalCount = 0;
  let first = PAGE_SIZE;
  // projectItems is non-null, so a refusal there nulls the whole issue; the page is then asked again without them.
  let withProjectFields = true;
  for (;;) {
    let body: RawResponse;
    try {
      body = await postQuery(fetchImpl, endpoint, token, {
        owner: repository.owner, repo: repository.name, first, after, avatarSize: AVATAR_SIZE, checksPageSize: CHECKS_PAGE_SIZE, commentsFetched: COMMENTS_FETCHED,
        withChecks: parts.checks, withComments: parts.comments, withProjectFields, projectItems: PROJECT_ITEMS,
        priorityField: PROJECT_FIELDS.priority, estimateField: PROJECT_FIELDS.estimate, sprintField: PROJECT_FIELDS.sprint,
      });
    } catch (error) {
      // A timeout comes back as 502-504, or, without CORS headers, as a failed fetch (status 0). The same page is asked
      // again with half the PRs, and later pages keep that size.
      if (!(error instanceof GitHubError) || !TIMEOUT_STATUSES.has(error.status) || first <= MIN_PAGE_SIZE) throw error;
      first = Math.max(MIN_PAGE_SIZE, Math.floor(first / 2));
      continue;
    }
    const unreadable = after ? null : unreadableRepository(body, repo);
    if (unreadable) {
      if (several) return { unreadable };
      throw graphqlError(body.errors![0]);
    }
    const connection = body.data && body.data.repository && body.data.repository.pullRequests;
    const fieldsRefused = (body.errors || []).find((error) => (error.path || []).join('.').includes('projectItems'));
    if (connection && fieldsRefused && withProjectFields) {
      withProjectFields = false;
      warnings.add('Project fields (Priority, Estimate, Sprint) are unavailable for this token: ' + fieldsRefused.message);
      continue;
    }
    for (const error of body.errors || []) {
      const path = (error.path || []).join('.');
      if (!connection || !path.includes('projectsV2')) throw graphqlError(error);
      projectsAvailable = false;
      warnings.add('Project membership is unavailable for this token: ' + error.message);
    }
    if (!connection) throw new GitHubError('Repository ' + repo + ' was not found.', 404);
    totalCount = connection.totalCount;
    rawNodes.push(...nodes(connection));
    after = connection.pageInfo.hasNextPage ? connection.pageInfo.endCursor : null;
    if (!after) break;
  }
  if (rawNodes.length !== totalCount) {
    warnings.add('GitHub reported ' + totalCount + ' open pull requests' + (several ? ' in ' + repo : '') + ' but returned ' + rawNodes.length + '.');
  }
  return { repo, prs: rawNodes.map((node) => normalizePullRequest(node, { repo, projectsAvailable })), warnings: [...warnings] };
}

// Repositories are read one after another, so a missing one only costs a warning and GitHub sees no burst.
export async function fetchOpenPullRequests({
  token, repositories, parts = ALL_PARTS, fetchImpl = fetch, endpoint = GRAPHQL_URL,
}: FetchOptions): Promise<Report> {
  if (!token) throw new GitHubError('A GitHub token is required to query the GraphQL API.', 0);
  const several = repositories.length > 1;
  const read: RepositoryPullRequests[] = [];
  const warnings = new Set<string>();
  for (const repository of repositories) {
    // With one repository there is nothing else to show, so a missing one fails as before.
    const result = await readRepository(repository, several, { token, parts, fetchImpl, endpoint });
    if ('unreadable' in result) warnings.add(result.unreadable);
    else read.push(result);
  }
  if (!read.length) throw new GitHubError('None of the repositories ' + repositories.map(repositoryName).join(', ') + ' was found.', 404);
  for (const result of read) for (const warning of result.warnings) warnings.add(warning);
  const prs = read.flatMap((result) => result.prs);
  prs.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  return {
    repos: read.map((result) => result.repo),
    generatedAt: new Date().toISOString(),
    warnings: [...warnings],
    prs,
  };
}
