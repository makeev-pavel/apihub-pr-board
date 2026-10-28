import { formatAgo } from '../../board/format.ts';
import { usePopover } from '../../hooks/usePopover.ts';
import type { Report } from '../../types.ts';

const UPDATE_POPOVER_PX = 280;

// Where the data comes from and how old it is, behind a small status dot: green for live data, gray for the snapshot.
export function UpdateInfo({ report, live, now }: { report: Report; live: boolean; now: number }) {
  const { open, position, ref, toggle } = usePopover(UPDATE_POPOVER_PX);
  const summary = (live ? 'Live data' : 'Hourly snapshot') + ', ' + formatAgo(report.generatedAt, now);
  return (
    <div className="update-info" ref={ref}>
      <button type="button" className={'btn ghost source-button' + (live ? ' live' : '')} aria-label={summary}
        title={summary} aria-expanded={open} onClick={toggle}>
        <span className="source-dot" aria-hidden="true"></span>
        <span className="source-age">{live ? 'live, ' : 'updated '}{formatAgo(report.generatedAt, now)}</span>
      </button>
      {open ? (
        <div className="popover" role="dialog" aria-label="Data source" style={position}>
          <strong className="popover-title">{live ? 'Live data' : 'Hourly snapshot'}</strong>
          <p className="muted">
            {live ? 'Loaded from GitHub with your token ' : 'Published by the scheduled workflow '}
            {formatAgo(report.generatedAt, now)}, at {new Date(report.generatedAt).toLocaleString()}.
          </p>
          {live ? null : <p className="muted">Refresh loads live data from GitHub.</p>}
          {report.runUrl ? <a className="popover-footer" href={report.runUrl} target="_blank" rel="noopener">Workflow run</a> : null}
        </div>
      ) : null}
    </div>
  );
}
