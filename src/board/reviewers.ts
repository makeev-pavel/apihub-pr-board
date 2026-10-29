// The Reviewers list of a PR as GitHub's sidebar shows it (TABLE-30): each person once, with where their review stands.

import { sameName } from '../names.ts';
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
// What still holds the PR comes first: requested changes, then reviews not given yet, and approvals last. Pending
// and asked again share a rank, so requests keep GitHub's order.
const RANK: Record<ReviewerStatus, number> = { changes: 0, pending: 1, again: 1, commented: 2, dismissed: 3, approved: 4 };

// A person asked again after a review of their own is listed once, as asked again. The viewer's own request leads
// the reviews not given yet.
export function reviewerEntries(pr: PullRequest, viewer = ''): ReviewerEntry[] {
  const isViewer = (actor: Actor, team: boolean) => !!viewer && !team && sameName(actor.login, viewer);
  const requested = pr.requestedReviewers.map((r): ReviewerEntry => {
    const earlier = !r.team && pr.reviewers.find((done) => sameName(done.login, r.login));
    return earlier ? { actor: earlier, team: false, status: 'again', mine: isViewer(earlier, false) }
      : { actor: r, team: r.team, status: 'pending', mine: isViewer(r, r.team) };
  });
  const done = pr.reviewers
    .filter((r) => !requested.some((e) => !e.team && sameName(e.actor.login, r.login)))
    .map((r): ReviewerEntry => ({ actor: r, team: false, status: BY_STATE[r.state] || 'commented', mine: isViewer(r, false) }));
  return [...requested.filter((e) => e.mine), ...requested.filter((e) => !e.mine), ...done]
    .sort((a, b) => RANK[a.status] - RANK[b.status]);
}
