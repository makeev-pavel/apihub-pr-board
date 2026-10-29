import type { ReactNode } from 'react';

// What the table body says when it has no rows: loading, no repositories chosen, nothing loaded yet, or no match.

export type TableMessageKind = 'loading' | 'no-repos' | 'not-loaded' | 'no-match';

export function TableMessage({ kind, colSpan, onResetView, progress }: {
  kind: TableMessageKind;
  colSpan: number;
  onResetView: () => void;
  // What a live load is doing, in place of the plain loading line (DATA-27).
  progress?: ReactNode;
}) {
  return (
    <tr><td colSpan={colSpan}><div className="empty">
      {kind === 'loading' && progress ? progress : null}
      {kind === 'loading' && !progress ? <span className="loading" role="status"><span className="spinner" aria-hidden="true"></span>Loading pull requests…</span> : null}
      {kind === 'no-repos' ? (
        <>
          <strong>Choose the repositories to show</strong>
          <span>Add them in Settings, or open a link with <code>?repos=owner/name</code>.</span>
        </>
      ) : null}
      {kind === 'not-loaded' ? <strong>No pull requests loaded yet</strong> : null}
      {kind === 'no-match' ? (
        <>
          <strong>No pull requests match this view</strong>
          <span>Try clearing the search or selecting more authors.</span>
          <button type="button" className="btn" onClick={onResetView}>Reset view</button>
        </>
      ) : null}
    </div></td></tr>
  );
}
