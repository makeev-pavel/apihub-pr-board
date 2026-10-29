// The Reviewers list of a PR as GitHub's sidebar shows it (TABLE-30): each person once, with where their review stands.

import { sameName } from '../repository.ts';
import type { Actor, PullRequest } from '../types.ts';

export type ReviewerStatus = 'pending' | 'again' | 'changes' | 'approved' | 'commented' | 'dismissed';

export interface ReviewerEntry {
  actor: Actor;
  team: boolean;
  status: ReviewerStatus;
  // The viewer's own line, never a team's.
  mine: boolean;
}

const BY_STATE: Record<string, ReviewerStatus> = { APPROVED: 'approved', CHANGES_REQUESTED: 'changes', DISMISSED: 'dismissed' };
// Reviews already given, the ones that block the PR first.
const DONE_ORDER: ReviewerStatus[] = ['changes', 'approved', 'commented', 'dismissed'];

// Requested reviewers come first: they still owe a review. A person asked again after a review of their own is listed
// once, as asked again. The viewer's own request leads, so a long list never hides it.
export function reviewerEntries(pr: PullRequest, viewer = ''): ReviewerEntry[] {
  const isViewer = (actor: Actor, team: boolean) => !!viewer && !team && sameName(actor.login, viewer);
  const requested = pr.requestedReviewers.map((r): ReviewerEntry => {
    const earlier = !r.team && pr.reviewers.find((done) => sameName(done.login, r.login));
    return earlier ? { actor: earlier, team: false, status: 'again', mine: isViewer(earlier, false) }
      : { actor: r, team: r.team, status: 'pending', mine: isViewer(r, r.team) };
  });
  const done = pr.reviewers
    .filter((r) => !requested.some((e) => !e.team && sameName(e.actor.login, r.login)))
    .map((r): ReviewerEntry => ({ actor: r, team: false, status: BY_STATE[r.state] || 'commented', mine: isViewer(r, false) }))
    .sort((a, b) => DONE_ORDER.indexOf(a.status) - DONE_ORDER.indexOf(b.status));
  return [...requested.filter((e) => e.mine), ...requested.filter((e) => !e.mine), ...done];
}
