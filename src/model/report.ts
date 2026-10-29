// Reads prs.json as the page receives it from the network.

import { isRepositoryName } from '../repository.ts';
import type { PullRequest, Report } from '../types.ts';

// A PR number repeats across repositories, so the repository is part of the identity.
export function pullRequestKey(pr: Pick<PullRequest, 'repo' | 'number'>): string {
  return pr.repo + '#' + pr.number;
}

// Files written before several repositories had one "repo" and PRs without one.
function reportRepos(report: { repos?: unknown; repo?: unknown }): string[] {
  if (Array.isArray(report.repos)) return report.repos.filter(isRepositoryName);
  return isRepositoryName(report.repo) ? [report.repo] : [];
}

// The number reaches REST paths, so an entry without a positive whole number is not a PR.
function isPullRequest(value: unknown): value is PullRequest {
  const number = value && typeof value === 'object' ? (value as { number?: unknown }).number : null;
  return Number.isInteger(number) && (number as number) > 0;
}

const LIST_FIELDS = ['assignees', 'labels', 'reviewers', 'requestedReviewers', 'issues', 'comments'] as const;

// Every list a PR renders, so one broken entry cannot blank the page.
function withLists(pr: PullRequest): PullRequest {
  const fixed: Record<string, unknown> = { ...pr };
  for (const field of LIST_FIELDS) if (!Array.isArray(pr[field])) fixed[field] = [];
  if (pr.projects !== null && !Array.isArray(pr.projects)) fixed.projects = null;
  return fixed as unknown as PullRequest;
}

// prs.json comes from the network: check the parts the page cannot render without.
export function parseReport(value: unknown): Report {
  const report = value as (Partial<Report> & { repo?: unknown }) | null;
  if (!report || typeof report !== 'object' || !Array.isArray(report.prs)) {
    throw new Error('the file has no list of pull requests');
  }
  const repos = reportRepos(report);
  const fallback = repos.length === 1 ? repos[0] : '';
  // A PR keeps its repository only when the file lists it, or lists none.
  const known = (repo: unknown) => isRepositoryName(repo) && (!repos.length || repos.some((r) => r.toLowerCase() === repo.toLowerCase()));
  return {
    repos,
    generatedAt: typeof report.generatedAt === 'string' ? report.generatedAt : new Date(0).toISOString(),
    runUrl: typeof report.runUrl === 'string' ? report.runUrl : null,
    warnings: Array.isArray(report.warnings) ? report.warnings.filter((w) => typeof w === 'string') : [],
    prs: (report.prs as unknown[]).filter(isPullRequest).map((pr) => withLists(known(pr.repo) ? pr : { ...pr, repo: fallback })),
  };
}
