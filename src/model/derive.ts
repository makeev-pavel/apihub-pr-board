// Adds the fields the board computes for each PR: age, areas, attention, bot authorship, and the search text.

import type { DerivedPullRequest, PullRequest } from '../types.ts';
import { areasOf } from './areas.ts';
import { cleanCommentText } from './comments.ts';
import { attentionReasons, DEFAULT_RULES, isBot } from './rules.ts';
import type { Rules } from './rules.ts';

const DAY_MS = 24 * 60 * 60 * 1000;

export function daysBetween(fromIso: string, now: number): number {
  return Math.max(0, Math.floor((now - Date.parse(fromIso)) / DAY_MS));
}

export function derive(pr: PullRequest, now: number, rules: Rules = DEFAULT_RULES): DerivedPullRequest {
  const ageDays = daysBetween(pr.createdAt, now);
  const comments = pr.comments || [];
  const latestComment = comments[0] || null;
  const commentText = latestComment ? cleanCommentText(latestComment.body) : '';
  const authorKey = pr.author ? pr.author.login : 'ghost';
  const labels = pr.labels || [];
  const reviewers = pr.reviewers || [];
  const requestedReviewers = pr.requestedReviewers || [];
  const attention = attentionReasons(pr, ageDays, rules);
  const areas = areasOf({ ...pr, labels }, rules.areaModules);
  return {
    ...pr,
    comments,
    latestComment,
    areas,
    labels,
    reviewers,
    requestedReviewers,
    authorKey,
    bot: isBot(pr.author, rules.extraBots),
    ageDays,
    stale: ageDays > rules.staleDays,
    attention,
    commentText,
    searchText: [
      '#' + pr.number,
      pr.repo,
      pr.title,
      authorKey,
      pr.base,
      pr.ci,
      pr.review.replace('_', ' '),
      pr.mergeable === 'conflicts' ? 'conflicts' : '',
      pr.draft ? 'draft' : '',
      areas.join(' '),
      pr.assignees.map((a) => a.login).join(' '),
      reviewers.map((r) => r.login).join(' '),
      requestedReviewers.map((r) => r.login).join(' '),
      labels.map((l) => l.name).join(' '),
      pr.checks ? pr.checks.failed.map((c) => c.name + ' ' + (c.workflow || '')).join(' ') : '',
      pr.issues.map((i) => [i.number ? '#' + i.number : '', i.title, i.type ? i.type.name : '', ...(i.labels || []).map((l) => l.name)].join(' ')).join(' '),
      (pr.projects || []).join(' '),
      comments.map((c) => (c.author ? c.author.login : '') + ' ' + cleanCommentText(c.body)).join(' '),
      attention.join(' '),
    ].join(' ').toLowerCase(),
  };
}
