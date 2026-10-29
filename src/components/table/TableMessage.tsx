// What the table body says when it has no rows: loading, no repositories chosen, nothing loaded yet, or no match.

export type TableMessageKind = 'loading' | 'no-repos' | 'not-loaded' | 'no-match';

export function TableMessage({ kind, colSpan, onResetView }: { kind: TableMessageKind; colSpan: number; onResetView: () => void }) {
  return (
    <tr><td colSpan={colSpan}><div className="empty">
      {kind === 'loading' ? 'Loading pull requests…' : null}
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
