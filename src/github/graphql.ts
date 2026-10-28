// Reads every open pull request through the GraphQL API, page by page.

import { repositoryName } from '../repository.ts';
import type { Repository } from '../repository.ts';
import type { Report } from '../types.ts';
import { GitHubError } from './http.ts';
import type { Fetch } from './http.ts';
import { nodes, normalizePullRequest } from './normalize.ts';
import {
  ALL_PARTS, AVATAR_SIZE, CHECKS_PAGE_SIZE, COMMENTS_FETCHED, OPEN_PULL_REQUESTS_QUERY, PAGE_SIZE,
} from './query.ts';
import type { QueryParts } from './query.ts';
import type { RawPullRequest, RawResponse } from './raw.ts';

export const GRAPHQL_URL = 'https://api.github.com/graphql';

export interface FetchOptions {
  token: string;
  repository: Repository;
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

// Partial GraphQL errors on optional fields (projects need extra token scopes) become warnings, not a failed report.
export async function fetchOpenPullRequests({
  token, repository, parts = ALL_PARTS, fetchImpl = fetch, endpoint = GRAPHQL_URL,
}: FetchOptions): Promise<Report> {
  if (!token) throw new GitHubError('A GitHub token is required to query the GraphQL API.', 0);
  const rawNodes: RawPullRequest[] = [];
  const warnings = new Set<string>();
  let projectsAvailable = true;
  let after: string | null = null;
  let totalCount = 0;
  do {
    const body = await postQuery(fetchImpl, endpoint, token, {
      owner: repository.owner, repo: repository.name, first: PAGE_SIZE, after, avatarSize: AVATAR_SIZE, checksPageSize: CHECKS_PAGE_SIZE, commentsFetched: COMMENTS_FETCHED,
      withChecks: parts.checks, withComments: parts.comments,
    });
    const connection = body.data && body.data.repository && body.data.repository.pullRequests;
    for (const error of body.errors || []) {
      const path = (error.path || []).join('.');
      if (!connection || !path.includes('projectsV2')) {
        throw new GitHubError('GitHub GraphQL error' + (path ? ' at ' + path : '') + ': ' + error.message, 200);
      }
      projectsAvailable = false;
      warnings.add('Project membership is unavailable for this token: ' + error.message);
    }
    if (!connection) throw new GitHubError('Repository ' + repositoryName(repository) + ' was not found.', 404);
    totalCount = connection.totalCount;
    rawNodes.push(...nodes(connection));
    after = connection.pageInfo.hasNextPage ? connection.pageInfo.endCursor : null;
  } while (after);
  if (rawNodes.length !== totalCount) {
    warnings.add('GitHub reported ' + totalCount + ' open pull requests but returned ' + rawNodes.length + '.');
  }
  const repo = repositoryName(repository);
  return {
    repos: [repo],
    generatedAt: new Date().toISOString(),
    warnings: Array.from(warnings),
    prs: rawNodes.map((node) => normalizePullRequest(node, { repo, projectsAvailable })),
  };
}
