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

// prs.json comes from the network: check the parts the page cannot render without.
export function parseReport(value: unknown): Report {
  const report = value as (Partial<Report> & { repo?: unknown }) | null;
  if (!report || typeof report !== 'object' || !Array.isArray(report.prs)) {
    throw new Error('the file has no list of pull requests');
  }
  const repos = reportRepos(report);
  const fallback = repos.length === 1 ? repos[0] : '';
  return {
    repos,
    generatedAt: typeof report.generatedAt === 'string' ? report.generatedAt : new Date(0).toISOString(),
    runUrl: typeof report.runUrl === 'string' ? report.runUrl : null,
    warnings: Array.isArray(report.warnings) ? report.warnings.filter((w) => typeof w === 'string') : [],
    prs: report.prs.map((pr) => (isRepositoryName(pr.repo) ? pr : { ...pr, repo: fallback })),
  };
}
