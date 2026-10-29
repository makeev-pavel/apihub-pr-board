// What a live load is doing, repository by repository, in words for the loading status (DATA-27).

import type { RepositoryProgress } from '../github/graphql.ts';

export interface RepoProgress {
  repo: string;
  status: 'waiting' | RepositoryProgress['status'];
  read: number;
  // Null until GitHub has answered the first page.
  total: number | null;
  // The last thing worth telling, such as a retry after a timeout.
  note: string;
}

export function startProgress(repos: string[]): RepoProgress[] {
  return repos.map((repo) => ({ repo, status: 'waiting', read: 0, total: null, note: '' }));
}

// Merges one event in. The repositories keep their order; an unknown one is ignored.
export function applyProgress(progress: RepoProgress[], event: Partial<RepositoryProgress> & { repo: string }): RepoProgress[] {
  const key = event.repo.toLowerCase();
  if (!progress.some((p) => p.repo.toLowerCase() === key)) return progress;
  return progress.map((p) => (p.repo.toLowerCase() === key ? { ...p, ...event, repo: p.repo, note: event.note ?? p.note } : p));
}

const plural = (n: number) => n + (n === 1 ? ' pull request' : ' pull requests');

function repoLine(p: RepoProgress): string {
  const count = p.total === null ? 'starting' : p.read + ' of ' + plural(p.total);
  return p.repo + ': ' + count + (p.note ? '. ' + p.note : '');
}

export function describeProgress(progress: RepoProgress[]): { headline: string; lines: string[] } {
  if (progress.every((p) => p.status === 'waiting')) return { headline: 'Connecting to GitHub', lines: [] };
  if (progress.length === 1) return { headline: 'Reading ' + repoLine(progress[0]), lines: [] };
  const done = progress.filter((p) => p.status === 'done' || p.status === 'unreadable').length;
  const read = progress.reduce((sum, p) => sum + p.read, 0);
  return {
    headline: 'Reading repositories: ' + done + ' of ' + progress.length + ' done, ' + read + ' pull requests so far',
    lines: progress.filter((p) => p.status === 'reading').map(repoLine),
  };
}

export function formatElapsed(ms: number): string {
  if (ms < 60_000) return (Math.floor(ms / 100) / 10).toFixed(1) + ' s';
  const seconds = Math.floor(ms / 1000);
  return Math.floor(seconds / 60) + ' min ' + (seconds % 60) + ' s';
}
