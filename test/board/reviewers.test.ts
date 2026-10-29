import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reviewerEntries } from '../../src/board/reviewers.ts';
import type { PullRequest } from '../../src/types.ts';

const person = (login: string) => ({ login, avatarUrl: null, bot: false, team: false });
const review = (login: string, state: string) => ({ login, avatarUrl: null, bot: false, state, at: null });
const entries = (fields: Partial<PullRequest>) =>
  reviewerEntries({ reviewers: [], requestedReviewers: [], ...fields } as PullRequest).map((e) => e.actor.login + ':' + e.status);

test('TABLE-30: reviewers are listed once each, those still to answer first, as on GitHub', () => {
  assert.deepEqual(entries({
    reviewers: [review('anna-dev', 'APPROVED'), review('chen-li', 'CHANGES_REQUESTED'), review('Boris-K', 'DISMISSED'), review('dara-ops', 'COMMENTED')],
    requestedReviewers: [person('hana-docs'), person('boris-k'), { ...person('backend'), team: true }],
  }), ['hana-docs:pending', 'Boris-K:again', 'backend:pending', 'chen-li:changes', 'anna-dev:approved', 'dara-ops:commented']);
});

test('TABLE-30: a team of the same name as a reviewer is not that reviewer asked again', () => {
  assert.deepEqual(entries({ reviewers: [review('core', 'APPROVED')], requestedReviewers: [{ ...person('core'), team: true }] }),
    ['core:pending', 'core:approved']);
  assert.deepEqual(entries({}), []);
});

test('TABLE-30: the viewer asked for a review leads the list, so a long list never hides it', () => {
  const pr = { reviewers: [], requestedReviewers: [person('anna-dev'), person('chen-li'), person('Boris-K')] } as unknown as PullRequest;
  assert.deepEqual(reviewerEntries(pr, 'boris-k').map((e) => e.actor.login), ['Boris-K', 'anna-dev', 'chen-li']);
});

test('TABLE-30: only the viewer\'s own line is marked as theirs, never a team of the same name', () => {
  const pr = {
    reviewers: [review('boris-k', 'APPROVED')],
    requestedReviewers: [{ ...person('boris-k'), team: true }, person('anna-dev')],
  } as unknown as PullRequest;
  assert.deepEqual(reviewerEntries(pr, 'Boris-K').map((e) => e.actor.login + ':' + e.mine), ['boris-k:false', 'anna-dev:false', 'boris-k:true']);
  assert.ok(reviewerEntries(pr).every((e) => !e.mine), 'no viewer, no line of theirs');
});
