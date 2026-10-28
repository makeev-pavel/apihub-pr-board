// GitHub's raw answers, before normalization: GraphQL nodes for the board and REST entries for the comments panel.

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

// REST shapes for the full comment list, which the panel loads when it opens; prs.json keeps only the latest ones.
export interface RestUser {
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
