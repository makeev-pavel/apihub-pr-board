// The shape of prs.json and of the rows the board derives from it.

export type CiState = 'passing' | 'failing' | 'running' | 'none';
export type ReviewState = 'approved' | 'changes_requested' | 'none';
export type MergeState = 'clean' | 'conflicts' | 'unknown';
export type AreaId = 'be' | 'fe';

export interface Actor {
  login: string;
  avatarUrl: string | null;
  bot: boolean;
}

export interface Reviewer extends Actor {
  // A latestOpinionatedReviews state: APPROVED, CHANGES_REQUESTED, or DISMISSED.
  state: string;
  at: string | null;
}

export interface RequestedReviewer extends Actor {
  team: boolean;
}

export interface Label {
  name: string;
  // Six hex digits without #, or null when GitHub sent something else.
  color: string | null;
  description: string;
}

export interface FailedCheck {
  name: string;
  workflow: string | null;
  // Lowercased CheckRun conclusion or StatusContext state, such as failure or timed_out.
  conclusion: string;
  url: string | null;
  description: string;
}

export interface Checks {
  failed: FailedCheck[];
  total: number;
  // False when only the first page of checks was read.
  complete: boolean;
}

export interface Issue {
  number: number | null;
  title: string;
  url: string;
}

export interface Comment {
  at: string;
  body: string;
  url: string | null;
  author: Actor | null;
  truncated: boolean;
}

export interface PullRequest {
  // owner/name; empty only when a broken prs.json left it unknown.
  repo: string;
  number: number;
  title: string;
  url: string;
  draft: boolean;
  base: string;
  author: Actor | null;
  assignees: Actor[];
  createdAt: string;
  updatedAt: string;
  ci: CiState;
  // Null unless CI is failing, or when the rollup had no check details.
  checks: Checks | null;
  review: ReviewState;
  reviewers: Reviewer[];
  requestedReviewers: RequestedReviewer[];
  labels: Label[];
  mergeable: MergeState;
  issues: Issue[];
  // Null when the token cannot read project membership.
  projects: string[] | null;
  // Newest first.
  comments: Comment[];
  // Set only on dev corner cases.
  example?: boolean;
  note?: string;
}

export interface Report {
  // owner/name of every repository the report covers.
  repos: string[];
  generatedAt: string;
  runUrl?: string | null;
  warnings: string[];
  prs: PullRequest[];
}

export interface DerivedPullRequest extends PullRequest {
  latestComment: Comment | null;
  areas: AreaId[];
  authorKey: string;
  bot: boolean;
  ageDays: number;
  // Open longer than the stale limit in the viewer's rules.
  stale: boolean;
  attention: string[];
  commentText: string;
  searchText: string;
}

// The dev server injects this as window.PR_BOARD_DEV to point the page at its GraphQL and REST mocks.
export interface DevConfig {
  graphqlUrl: string;
  restUrl: string;
}
