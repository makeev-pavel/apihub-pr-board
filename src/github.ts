// Shared by the scheduled build (Node) and the in-page Refresh button (browser): keep it free of Node APIs.

import type {
  Actor, Checks, CiState, Comment, FailedCheck, Label, MergeState, PullRequest, Report, RequestedReviewer, ReviewState,
} from './types.ts';
import { stripHtmlComments } from './model.ts';
import { repositoryName } from './repository.ts';
import type { Repository } from './repository.ts';

export const GRAPHQL_URL = 'https://api.github.com/graphql';
export const REST_URL = 'https://api.github.com';

const PAGE_SIZE = 50;
const CHECKS_PAGE_SIZE = 100;
export const RECENT_COMMENTS = 2;
// More than RECENT_COMMENTS, so empty and marker-only comments do not hide older real ones.
const COMMENTS_FETCHED = 5;
// Long bot reports are cut so prs.json stays small; the popover links to the full comment.
export const COMMENT_BODY_LIMIT = 4000;
const AVATAR_SIZE = 48;
const REST_PAGE_SIZE = 100;
// Enough for any real PR; the panel says so when a list is longer.
const MAX_REST_PAGES = 5;

export const OPEN_PULL_REQUESTS_QUERY = `
query($owner: String!, $repo: String!, $first: Int!, $after: String, $avatarSize: Int!, $checksPageSize: Int!, $commentsFetched: Int!,
  $withChecks: Boolean!, $withComments: Boolean!) {
  repository(owner: $owner, name: $repo) {
    pullRequests(states: OPEN, first: $first, after: $after, orderBy: {field: CREATED_AT, direction: DESC}) {
      totalCount
      pageInfo { hasNextPage endCursor }
      nodes {
        number
        title
        url
        isDraft
        createdAt
        updatedAt
        baseRefName
        mergeable
        author { __typename login avatarUrl(size: $avatarSize) }
        assignees(first: 10) { nodes { login avatarUrl(size: $avatarSize) } }
        labels(first: 30) { nodes { name color description } }
        reviewRequests(first: 20) {
          nodes {
            requestedReviewer {
              __typename
              ... on User { login avatarUrl(size: $avatarSize) }
              ... on Bot { login avatarUrl(size: $avatarSize) }
              ... on Team { name avatarUrl(size: $avatarSize) }
            }
          }
        }
        closingIssuesReferences(first: 10) { nodes { number title url } }
        projectsV2(first: 10) { nodes { title } }
        latestOpinionatedReviews(first: 20) { nodes { state submittedAt author { __typename login avatarUrl(size: $avatarSize) } } }
        commits(last: 1) {
          nodes {
            commit {
              statusCheckRollup {
                state
                contexts(first: $checksPageSize) @include(if: $withChecks) {
                  totalCount
                  pageInfo { hasNextPage }
                  nodes {
                    __typename
                    ... on CheckRun { name conclusion detailsUrl checkSuite { workflowRun { workflow { name } } } }
                    ... on StatusContext { context state targetUrl description }
                  }
                }
              }
            }
          }
        }
        comments(last: $commentsFetched) @include(if: $withComments) { nodes { createdAt body url author { __typename login avatarUrl(size: $avatarSize) } } }
        reviews(last: 10) @include(if: $withComments) { nodes { submittedAt body url author { __typename login avatarUrl(size: $avatarSize) } } }
      }
    }
  }
}
`;

// Raw GraphQL nodes, typed as loosely as GitHub may send them: any connection or entry can be null.
export type Connection<T> = { nodes?: (T | null)[] | null } | null | undefined;

export interface RawActor {
  __typename?: string;
  login: string;
  avatarUrl?: string | null;
}

export interface RawLabel {
  name: string;
  color?: string | null;
  description?: string | null;
}

export interface RawCheckRun {
  __typename: 'CheckRun';
  name: string;
  conclusion: string | null;
  detailsUrl?: string | null;
  checkSuite?: { workflowRun?: { workflow?: { name: string } | null } | null } | null;
}

export interface RawStatusContext {
  __typename: 'StatusContext';
  context: string;
  state: string;
  targetUrl?: string | null;
  description?: string | null;
}

export interface RawRollup {
  state: string;
  contexts?: {
    totalCount: number;
    pageInfo?: { hasNextPage: boolean } | null;
    nodes?: (RawCheckRun | RawStatusContext | null)[] | null;
  } | null;
}

export interface RawReview {
  state?: string;
  submittedAt?: string | null;
  body?: string | null;
  url?: string | null;
  author?: RawActor | null;
}

export interface RawComment {
  createdAt: string;
  body: string;
  url?: string | null;
  author?: RawActor | null;
}

export type RawRequestedReviewer =
  | { __typename: 'User' | 'Bot'; login: string; avatarUrl?: string | null }
  | { __typename: 'Team'; name: string; avatarUrl?: string | null };

export interface RawReviewRequest {
  requestedReviewer: RawRequestedReviewer | null;
}

export interface RawPullRequest {
  number: number;
  title: string;
  url: string;
  isDraft: boolean;
  createdAt: string;
  updatedAt: string;
  baseRefName: string;
  mergeable?: string | null;
  author?: RawActor | null;
  assignees?: Connection<RawActor>;
  labels?: Connection<RawLabel>;
  reviewRequests?: Connection<RawReviewRequest>;
  closingIssuesReferences?: Connection<{ number?: number | null; title: string; url: string }>;
  projectsV2?: Connection<{ title: string }>;
  latestOpinionatedReviews?: Connection<RawReview>;
  commits?: Connection<{ commit?: { statusCheckRollup?: RawRollup | null } | null }>;
  comments?: Connection<RawComment>;
  reviews?: Connection<RawReview>;
}

export interface RawResponse {
  data?: {
    repository?: {
      pullRequests?: {
        totalCount: number;
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes?: (RawPullRequest | null)[] | null;
      } | null;
    } | null;
  } | null;
  errors?: { type?: string; message: string; path?: (string | number)[] }[];
}

const CI_BY_ROLLUP: Record<string, CiState> = {
  SUCCESS: 'passing',
  FAILURE: 'failing',
  ERROR: 'failing',
  PENDING: 'running',
  EXPECTED: 'running',
};

const HEX_COLOR = /^[0-9a-f]{6}$/i;

// CANCELLED is left out on purpose: superseded runs are cancelled and do not fail the PR.
const FAILED_CHECK_CONCLUSIONS = new Set(['FAILURE', 'TIMED_OUT', 'STARTUP_FAILURE', 'ACTION_REQUIRED']);
const FAILED_STATUS_STATES = new Set(['FAILURE', 'ERROR']);

const MERGEABLE_BY_STATE: Record<string, MergeState> = {
  MERGEABLE: 'clean',
  CONFLICTING: 'conflicts',
  UNKNOWN: 'unknown',
};

export class GitHubError extends Error {
  // The HTTP status, 200 for a GraphQL error, or 0 when GitHub was not reached.
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'GitHubError';
    this.status = status;
  }
}

function nodes<T>(connection: Connection<T>): T[] {
  return ((connection && connection.nodes) || []).filter((node): node is T => node !== null);
}

function person(actor: RawActor | null | undefined): Actor | null {
  if (!actor) return null;
  return { login: actor.login, avatarUrl: actor.avatarUrl || null, bot: actor.__typename === 'Bot' };
}

// latestOpinionatedReviews already drops comment-only reviews, so a later comment never cancels an approval.
export function reviewState(reviews: RawReview[]): ReviewState {
  if (reviews.some((r) => r.state === 'CHANGES_REQUESTED')) return 'changes_requested';
  return reviews.some((r) => r.state === 'APPROVED') ? 'approved' : 'none';
}

function clip(body: string): { body: string; truncated: boolean } {
  return body.length > COMMENT_BODY_LIMIT ? { body: body.slice(0, COMMENT_BODY_LIMIT).trimEnd() + '…', truncated: true } : { body, truncated: false };
}

// Newest first: issue comments and review summaries together, skipping bodies that are empty or only HTML comments.
function mergeComments(comments: RawComment[], reviews: RawReview[]): Omit<Comment, 'truncated'>[] {
  const candidates = [
    ...comments.map((c) => ({ at: c.createdAt, body: c.body, url: c.url || null, author: person(c.author) })),
    ...reviews.map((r) => ({ at: r.submittedAt, body: r.body, url: r.url || null, author: person(r.author) })),
  ].filter((c): c is Omit<Comment, 'truncated'> => !!c.at && !!stripHtmlComments(c.body));
  candidates.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return candidates;
}

export function recentComments(comments: RawComment[], reviews: RawReview[], limit = RECENT_COMMENTS): Comment[] {
  return mergeComments(comments, reviews).slice(0, limit).map((c) => ({ ...c, ...clip(c.body) }));
}

export function normalizeLabel(label: RawLabel): Label {
  return {
    name: label.name,
    color: label.color && HEX_COLOR.test(label.color) ? label.color.toLowerCase() : null,
    description: label.description || '',
  };
}

// Team requests need org read access; without it GitHub returns null and the request is skipped.
function requestedReviewer(request: RawReviewRequest): RequestedReviewer | null {
  const reviewer = request.requestedReviewer;
  if (!reviewer) return null;
  if (reviewer.__typename === 'Team') return { login: reviewer.name, avatarUrl: reviewer.avatarUrl || null, bot: false, team: true };
  return { login: reviewer.login, avatarUrl: reviewer.avatarUrl || null, bot: reviewer.__typename === 'Bot', team: false };
}

// Returns null when the rollup has no contexts (not collected), otherwise the failed checks.
export function failedChecks(rollup: RawRollup | null | undefined): Checks | null {
  const contexts = rollup && rollup.contexts;
  if (!contexts) return null;
  const failed: FailedCheck[] = [];
  for (const c of nodes(contexts)) {
    if (c.__typename === 'CheckRun' && c.conclusion && FAILED_CHECK_CONCLUSIONS.has(c.conclusion)) {
      const run = c.checkSuite && c.checkSuite.workflowRun;
      failed.push({
        name: c.name,
        workflow: (run && run.workflow && run.workflow.name) || null,
        conclusion: c.conclusion.toLowerCase(),
        url: c.detailsUrl || null,
        description: '',
      });
    } else if (c.__typename === 'StatusContext' && FAILED_STATUS_STATES.has(c.state)) {
      failed.push({ name: c.context, workflow: null, conclusion: c.state.toLowerCase(), url: c.targetUrl || null, description: c.description || '' });
    }
  }
  return { failed, total: contexts.totalCount, complete: !(contexts.pageInfo && contexts.pageInfo.hasNextPage) };
}

export function normalizePullRequest(node: RawPullRequest, { projectsAvailable = true } = {}): PullRequest {
  const commit = nodes(node.commits)[0];
  const rollup = commit && commit.commit && commit.commit.statusCheckRollup;
  const review = reviewState(nodes(node.latestOpinionatedReviews));
  const ci = (rollup && CI_BY_ROLLUP[rollup.state]) || 'none';
  return {
    number: node.number,
    title: node.title,
    url: node.url,
    draft: node.isDraft,
    base: node.baseRefName,
    author: person(node.author),
    assignees: nodes(node.assignees).map((a) => ({ login: a.login, avatarUrl: a.avatarUrl || null, bot: false })),
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    ci,
    checks: ci === 'failing' ? failedChecks(rollup) : null,
    review,
    reviewers: nodes(node.latestOpinionatedReviews).map((r) => ({
      ...(person(r.author) || { login: 'ghost', avatarUrl: null, bot: false }),
      state: r.state || '',
      at: r.submittedAt || null,
    })),
    requestedReviewers: nodes(node.reviewRequests).map(requestedReviewer).filter((r) => r !== null),
    labels: nodes(node.labels).map(normalizeLabel),
    mergeable: (node.mergeable && MERGEABLE_BY_STATE[node.mergeable]) || 'unknown',
    issues: nodes(node.closingIssuesReferences).map((i) => ({ number: i.number || null, title: i.title, url: i.url })),
    projects: projectsAvailable ? nodes(node.projectsV2).map((p) => p.title) : null,
    comments: recentComments(nodes(node.comments), nodes(node.reviews)),
  };
}

type Fetch = (input: string, init: RequestInit) => Promise<Response>;

// The heaviest parts of the query, which a viewer can skip when the column that shows them is hidden.
export interface QueryParts {
  // Failed check details for the CI popover (up to CHECKS_PAGE_SIZE checks per PR).
  checks: boolean;
  // Comment and review bodies for the Last comment column.
  comments: boolean;
}

export const ALL_PARTS: QueryParts = { checks: true, comments: true };

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
  return {
    repo: repositoryName(repository),
    generatedAt: new Date().toISOString(),
    warnings: Array.from(warnings),
    prs: rawNodes.map((node) => normalizePullRequest(node, { projectsAvailable })),
  };
}

// REST shapes for the full comment list, which the panel loads when it opens. prs.json keeps only the latest two.
interface RestUser {
  login: string;
  avatar_url?: string | null;
  type?: string;
}

export interface RestComment {
  created_at: string;
  body?: string | null;
  html_url?: string | null;
  user?: RestUser | null;
}

export interface RestReview {
  submitted_at?: string | null;
  body?: string | null;
  html_url?: string | null;
  user?: RestUser | null;
}

export interface AllComments {
  comments: Comment[];
  // False when a list had more than MAX_REST_PAGES pages.
  complete: boolean;
}

export interface AllCommentsOptions {
  number: number;
  repository: Repository;
  // Optional: without it GitHub allows 60 requests an hour per IP address.
  token?: string;
  fetchImpl?: Fetch;
  restUrl?: string;
}

function restActor(user: RestUser | null | undefined): RawActor | null {
  if (!user) return null;
  const avatar = user.avatar_url ? user.avatar_url + (user.avatar_url.includes('?') ? '&' : '?') + 's=' + AVATAR_SIZE : null;
  return { __typename: user.type === 'Bot' ? 'Bot' : 'User', login: user.login, avatarUrl: avatar };
}

function nextPage(link: string | null): string | null {
  const match = link ? /<([^>]+)>;\s*rel="next"/.exec(link) : null;
  return match ? match[1] : null;
}

async function getAllPages<T>(fetchImpl: Fetch, url: string, token: string): Promise<{ items: T[]; complete: boolean }> {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const items: T[] = [];
  let next: string | null = url + '?per_page=' + REST_PAGE_SIZE;
  for (let page = 0; next && page < MAX_REST_PAGES; page += 1) {
    let response: Response;
    try {
      response = await fetchImpl(next, { headers });
    } catch (error) {
      throw new GitHubError('Cannot reach api.github.com: ' + (error as Error).message, 0);
    }
    if (response.status === 401) throw new GitHubError('GitHub rejected the token. Replace it in Settings.', 401);
    if ((response.status === 403 || response.status === 429) && response.headers.get('x-ratelimit-remaining') === '0') {
      throw new GitHubError(token
        ? 'The GitHub API rate limit for your token is used up. Try again later.'
        : 'GitHub allows 60 requests an hour without a token, and they are used up. Add a token in Settings.', response.status);
    }
    if (!response.ok) throw new GitHubError('GitHub API returned HTTP ' + response.status + '.', response.status);
    items.push(...(await response.json()) as T[]);
    next = nextPage(response.headers.get('link'));
  }
  return { items, complete: !next };
}

// Every non-empty comment and review summary of a PR, newest first and not cut.
export async function fetchAllComments({ number, repository, token = '', fetchImpl = fetch, restUrl = REST_URL }: AllCommentsOptions): Promise<AllComments> {
  const base = restUrl + '/repos/' + repositoryName(repository);
  const [comments, reviews] = await Promise.all([
    getAllPages<RestComment>(fetchImpl, base + '/issues/' + number + '/comments', token),
    getAllPages<RestReview>(fetchImpl, base + '/pulls/' + number + '/reviews', token),
  ]);
  const merged = mergeComments(
    comments.items.map((c) => ({ createdAt: c.created_at, body: c.body || '', url: c.html_url, author: restActor(c.user) })),
    reviews.items.map((r) => ({ submittedAt: r.submitted_at, body: r.body, url: r.html_url, author: restActor(r.user) })),
  );
  return { comments: merged.map((c) => ({ ...c, truncated: false })), complete: comments.complete && reviews.complete };
}
