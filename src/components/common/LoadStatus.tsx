import { useEffect, useState } from 'react';
import { describeProgress, formatElapsed } from '../../board/progress.ts';
import type { RepoProgress } from '../../board/progress.ts';

// A live load in progress, or the one that just finished (DATA-27).
export interface LoadState {
  startedAt: number;
  repos: RepoProgress[];
  // Set once the data is in.
  finished?: { at: number; prs: number; repos: number };
}

const TICK_MS = 100;

// The spinner, what the load is doing, and a running clock. It sits in the empty table, or in a corner over a table
// that already has rows, so they stay where they are.
export function LoadStatus({ load, floating = false }: { load: LoadState; floating?: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (load.finished) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(timer);
  }, [load.finished]);
  const cls = 'load-status' + (floating ? ' floating' : '') + (load.finished ? ' finished' : '');
  if (load.finished) {
    const { prs, repos, at } = load.finished;
    return (
      <div className={cls} role="status">
        <span className="done-mark" aria-hidden="true">✓</span>
        <strong>Loaded {prs === 1 ? '1 pull request' : prs + ' pull requests'}{repos > 1 ? ' from ' + repos + ' repositories' : ''}</strong>
        <span className="elapsed">in {formatElapsed(at - load.startedAt)}</span>
      </div>
    );
  }
  const { headline, lines } = describeProgress(load.repos);
  return (
    <div className={cls}>
      <span className="spinner" aria-hidden="true"></span>
      <div className="load-text">
        <div className="load-head">
          <strong role="status">{headline}</strong>
          {/* The clock ticks ten times a second, too often for a screen reader. */}
          <span className="elapsed" aria-hidden="true">{formatElapsed(Math.max(0, now - load.startedAt))}</span>
        </div>
        {lines.length ? <ul className="load-lines">{lines.map((line) => <li key={line}>{line}</li>)}</ul> : null}
      </div>
    </div>
  );
}
