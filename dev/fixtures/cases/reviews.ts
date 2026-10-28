// Corner cases. Review: approvals, requested changes, dismissed reviews, and pending reviewers.

import { conn, label, requested, review, team, user } from '../builders.ts';
import type { FixtureEntry } from '../builders.ts';
import { caseKit } from './kit.ts';

const FIRST_NUMBER = 9400;

export function reviewCases(now: number): FixtureEntry[] {
  const { node, ago } = caseKit(now, FIRST_NUMBER);
  return [
    node('Ready to merge: approved, checks passed, no conflicts.', {
      title: 'feat(api-linter-service): add rule for missing operationId',
      author: user('chen-li'), createdAt: ago(3), updatedAt: ago(0, 2),
      labels: conn([label('enhancement', 'a2eeef'), label('module:api-linter-service', '0E8A16')]),
      latestOpinionatedReviews: conn([review('APPROVED', 'anna-dev', ago(0, 6))]),
      comments: conn([{ createdAt: ago(0, 2), author: user('anna-dev'), body: 'LGTM, merging after the release branch is cut.' }]),
    }),
    node('One reviewer approved and another requested changes. Requested changes win.', {
      title: 'refactor(backend): move package search into its own service',
      author: user('anna-dev'), createdAt: ago(4), updatedAt: ago(1),
      latestOpinionatedReviews: conn([
        review('APPROVED', 'boris-k', ago(0, 6)),
        review('CHANGES_REQUESTED', 'dara-ops', ago(0, 6)),
      ]),
    }),
    node('The only review was dismissed, so the PR has no approval.', {
      title: 'fix(ui): keep filters when switching package versions',
      author: user('boris-k'), createdAt: ago(2), updatedAt: ago(0, 6),
      latestOpinionatedReviews: conn([review('DISMISSED', 'hana-docs', ago(0, 6))]),
    }),
    node('Approved by two people (✓2), and one more reviewer is still requested (◷1).', {
      title: 'feat(ui): remember the last opened package tab',
      author: user('boris-k'), createdAt: ago(2), updatedAt: ago(0, 3),
      latestOpinionatedReviews: conn([review('APPROVED', 'anna-dev', ago(0, 3)), review('APPROVED', 'emil-qa', ago(1, 2))]),
      reviewRequests: conn([requested('hana-docs')]),
    }),
    node('No approval yet: five reviewers requested, including a team. The gray ◷5 next to the dash counts them.', {
      title: 'refactor(portal-backend): split the version service',
      author: user('anna-dev'), createdAt: ago(4), updatedAt: ago(3),
      reviewRequests: conn([
        requested('boris-k'), requested('chen-li'), requested('dara-ops'), requested('emil-qa'),
        team('widgets-maintainers'),
      ]),
    }),
    node('The approving reviewer deleted their account, so the approval shows ghost. A team request without org access comes back null and is skipped.', {
      title: 'fix(agent): close idle watch connections',
      author: user('farah-ui'), createdAt: ago(5), updatedAt: ago(2),
      latestOpinionatedReviews: conn([review('APPROVED', null, ago(2))]),
      reviewRequests: conn([{ requestedReviewer: null }]),
    }),
    node('No reviews and nobody requested.', {
      title: 'docs(api): describe the export endpoint',
      author: user('gleb-be'), createdAt: ago(1), updatedAt: ago(1),
    }),
  ];
}
