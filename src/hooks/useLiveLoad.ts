import { useEffect, useRef, useState } from 'react';
import { LOAD_SUMMARY_MS } from '../board/format.ts';
import { applyProgress, startProgress } from '../board/progress.ts';
import type { LoadState } from '../components/common/LoadStatus.tsx';
import { fetchOpenPullRequests } from '../github/graphql.ts';
import type { FetchOptions } from '../github/graphql.ts';
import { repositoryName } from '../repository.ts';
import type { Report } from '../types.ts';

// A live load from GitHub: whether one runs, what it is doing (DATA-27), and why the last one failed. A newer load,
// such as one after a token is saved mid-load, takes over, and the older one's results, error, and status are dropped.
export function useLiveLoad() {
  const [refreshing, setRefreshing] = useState(false);
  const [load, setLoad] = useState<LoadState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastAttempt, setLastAttempt] = useState(0);
  const loadId = useRef(0);

  const start = (options: Omit<FetchOptions, 'onProgress'>, onLoaded: (report: Report) => void) => {
    setRefreshing(true);
    setError(null);
    const startedAt = Date.now();
    setLastAttempt(startedAt);
    const id = ++loadId.current;
    const current = () => loadId.current === id;
    setLoad({ id, startedAt, repos: startProgress(options.repositories.map(repositoryName)) });
    const ours = (change: (prev: LoadState) => LoadState | null) => setLoad((prev) => (prev && prev.id === id ? change(prev) : prev));
    fetchOpenPullRequests({ ...options, onProgress: (event) => ours((prev) => ({ ...prev, repos: applyProgress(prev.repos, event) })) })
      .then((report) => {
        if (!current()) return;
        onLoaded(report);
        ours((prev) => ({ ...prev, finished: { at: Date.now(), prs: report.prs.length, repos: report.repos.length } }));
      })
      .catch((failure: Error) => {
        if (!current()) return;
        setError(failure.message);
        ours(() => null);
      })
      .finally(() => { if (current()) setRefreshing(false); });
  };

  // The summary of a finished load stays a few seconds, then goes.
  useEffect(() => {
    if (!load || !load.finished) return undefined;
    const timer = window.setTimeout(() => setLoad((prev) => (prev === load ? null : prev)), LOAD_SUMMARY_MS);
    return () => window.clearTimeout(timer);
  }, [load]);

  return { start, refreshing, load, error, setError, lastAttempt };
}
