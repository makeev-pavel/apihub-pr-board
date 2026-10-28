// Small builders for raw GraphQL nodes, shared by the corner cases and the generated board.

import type {
  RawActor, RawCheckRun, RawLabel, RawReview, RawReviewRequest, RawRollup, RawStatusContext,
} from '../../src/github.ts';
import { avatarUrl } from '../avatars.ts';
import { REPO_URL } from './people.ts';

const HOUR_MS = 60 * 60 * 1000;
export const PULLS_URL = REPO_URL + '/pulls';
export const ISSUES_URL = REPO_URL + '/issues';
export const ACTIONS_URL = REPO_URL + '/actions';

export function user(login: string): RawActor & { avatarUrl: string } {
  return { __typename: 'User', login, avatarUrl: avatarUrl(login) };
}

export function bot(login: string): RawActor & { avatarUrl: string } {
  return { __typename: 'Bot', login, avatarUrl: avatarUrl(login) };
}

export function conn<T>(nodes: (T | null)[]) {
  return { nodes };
}

export function label(name: string, color: string, description = ''): RawLabel {
  return { name, color, description };
}

export function rollup(state: string | null, contexts?: RawRollup['contexts']) {
  return conn([{ commit: { statusCheckRollup: state ? { state, ...(contexts ? { contexts } : {}) } : null } }]);
}

export function run(name: string, conclusion: string, workflow: string | null = 'CI'): RawCheckRun {
  return {
    __typename: 'CheckRun', name, conclusion, detailsUrl: ACTIONS_URL,
    checkSuite: { workflowRun: workflow ? { workflow: { name: workflow } } : null },
  };
}

export function checks(list: (RawCheckRun | RawStatusContext)[], { totalCount = list.length, hasNextPage = false } = {}): RawRollup['contexts'] {
  return { totalCount, pageInfo: { hasNextPage }, nodes: list };
}

export function review(state: string, login: string | null, submittedAt: string): RawReview {
  return { state, submittedAt, author: login ? user(login) : null };
}

export function requested(login: string): RawReviewRequest {
  return { requestedReviewer: { __typename: 'User', login, avatarUrl: avatarUrl(login) } };
}

export function team(name: string): RawReviewRequest {
  return { requestedReviewer: { __typename: 'Team', name, avatarUrl: null } };
}

// An ISO time the given amount before now.
export function agoFrom(now: number) {
  return (days: number, hours = 0, minutes = 0) =>
    new Date(now - days * 24 * HOUR_MS - hours * HOUR_MS - minutes * 60 * 1000).toISOString();
}
