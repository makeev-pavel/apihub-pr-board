// Turns raw GraphQL nodes into the PullRequest shape of prs.json.

import { stripHtmlComments } from '../model/comments.ts';
import { ISSUE_TYPE_COLORS } from '../types.ts';
import type {
  Actor, Checks, CiState, Comment, FailedCheck, Issue, IssueTypeColor, Label, MergeState, PullRequest, RequestedReviewer, ReviewState,
} from '../types.ts';
import type {
  Connection, RawActor, RawComment, RawIssue, RawLabel, RawProjectItem, RawPullRequest, RawReview, RawReviewRequest, RawRollup,
} from './raw.ts';

export const RECENT_COMMENTS = 2;

// Long bot reports are cut so prs.json stays small; the popover links to the full comment.
export const COMMENT_BODY_LIMIT = 4000;

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

export function nodes<T>(connection: Connection<T>): T[] {
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
export function mergeComments(comments: RawComment[], reviews: RawReview[]): Omit<Comment, 'truncated'>[] {
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

function knownColor(color: string | null | undefined): IssueTypeColor | null {
  const lower = (color || '').toLowerCase();
  return (ISSUE_TYPE_COLORS as readonly string[]).includes(lower) ? lower as IssueTypeColor : null;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

// The first project that sets a field gives its value (DATA-25).
function projectFields(items: RawProjectItem[]): Pick<Issue, 'priority' | 'estimate' | 'sprint'> {
  const priority = items.map((item) => item.priority).find((value) => value && typeof value.name === 'string');
  const estimate = items.map((item) => item.estimate).find((value) => value && typeof value.number === 'number');
  const sprint = items.map((item) => item.sprint)
    .find((value) => value && typeof value.title === 'string' && DAY.test(value.startDate || '') && typeof value.duration === 'number');
  return {
    priority: priority ? { name: priority.name!, color: knownColor(priority.color) } : null,
    estimate: estimate ? estimate.number! : null,
    sprint: sprint ? { title: sprint.title!, startDate: sprint.startDate!, duration: sprint.duration! } : null,
  };
}

// An unknown type color becomes null, and the type shows in neutral colors.
export function normalizeIssue(issue: RawIssue): Issue {
  const type = issue.issueType;
  return {
    number: issue.number || null,
    title: issue.title,
    url: issue.url,
    type: type ? { name: type.name, color: knownColor(type.color) } : null,
    labels: nodes(issue.labels).map(normalizeLabel),
    ...projectFields(nodes(issue.projectItems)),
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

export function normalizePullRequest(node: RawPullRequest, { repo = '', projectsAvailable = true } = {}): PullRequest {
  const commit = nodes(node.commits)[0];
  const rollup = commit && commit.commit && commit.commit.statusCheckRollup;
  const review = reviewState(nodes(node.latestOpinionatedReviews));
  const ci = (rollup && CI_BY_ROLLUP[rollup.state]) || 'none';
  return {
    repo,
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
    issues: nodes(node.closingIssuesReferences).map(normalizeIssue),
    projects: projectsAvailable ? nodes(node.projectsV2).map((p) => p.title) : null,
    comments: recentComments(nodes(node.comments), nodes(node.reviews)),
  };
}
