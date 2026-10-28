// Corner cases as raw GraphQL pull request nodes, sorted by topic under cases/. The dev server runs them through the
// same normalizePullRequest() as real data, so they exercise parsing as well as layout.

import type { RawPullRequest } from '../../src/github.ts';
import { titleCases } from './cases/titles.ts';
import { authorCases } from './cases/authors.ts';
import { checkCases } from './cases/checks.ts';
import { reviewCases } from './cases/reviews.ts';
import { commentCases } from './cases/comments.ts';
import { labelCases } from './cases/labels.ts';
import { attentionCases } from './cases/attention.ts';
import { quirkCases } from './cases/quirks.ts';

export interface FixtureEntry {
  node: RawPullRequest;
  // Shown under the title on the board; null for ordinary PRs.
  note: string | null;
}

export function cornerCaseNodes(now: number): FixtureEntry[] {
  return [
    ...titleCases(now),
    ...authorCases(now),
    ...checkCases(now),
    ...reviewCases(now),
    ...commentCases(now),
    ...labelCases(now),
    ...attentionCases(now),
    ...quirkCases(now),
  ];
}
