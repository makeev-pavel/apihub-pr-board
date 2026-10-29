// The Reviewers list of a PR as GitHub's sidebar shows it (TABLE-30): each person once, with where their review stands.

import type { Actor, PullRequest } from '../types.ts';

export type ReviewerStatus = 'pending' | 'again' | 'changes' | 'approved' | 'commented' | 'dismissed';

export interface ReviewerEntry {
  actor: Actor;
  team: boolean;
  status: ReviewerStatus;
}

const BY_STATE: Record<string, ReviewerStatus> = { APPROVED: 'approved', CHANGES_REQUESTED: 'changes', DISMISSED: 'dismissed' };
// Reviews already given, the ones that block the PR first.
const DONE_ORDER: ReviewerStatus[] = ['changes', 'approved', 'commented', 'dismissed'];

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

// Requested reviewers come first: they still owe a review. A person asked again after a review of their own is listed
// once, as asked again. The viewer's own request leads, so a long list never hides it.
export function reviewerEntries(pr: PullRequest, viewer = ''): ReviewerEntry[] {
  const requested = pr.requestedReviewers.map((r): ReviewerEntry => {
    const earlier = !r.team && pr.reviewers.find((done) => same(done.login, r.login));
    return earlier ? { actor: earlier, team: false, status: 'again' } : { actor: r, team: r.team, status: 'pending' };
  });
  const isViewer = (e: ReviewerEntry) => !!viewer && !e.team && same(e.actor.login, viewer);
  const done = pr.reviewers
    .filter((r) => !requested.some((e) => !e.team && same(e.actor.login, r.login)))
    .map((r): ReviewerEntry => ({ actor: r, team: false, status: BY_STATE[r.state] || 'commented' }))
    .sort((a, b) => DONE_ORDER.indexOf(a.status) - DONE_ORDER.indexOf(b.status));
  return [...requested.filter(isViewer), ...requested.filter((e) => !isViewer(e)), ...done];
}
