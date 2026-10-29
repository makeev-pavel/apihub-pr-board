import type { CSSProperties } from 'react';
import { displayLogin, formatAgo, plural } from '../../board/format.ts';
import { useAllComments } from '../../hooks/useAllComments.ts';
import { POPOVER_EDGE_PX, usePopover } from '../../hooks/usePopover.ts';
import { markdownText, renderMarkdown } from '../../markdown.ts';
import type { DerivedPullRequest } from '../../types.ts';
import { Avatar } from '../common/Avatar.tsx';

// Comments open in a panel along the right edge of the window, so long reports have the full height, and wide enough
// for code and tables; a narrow window gets its whole width.
const COMMENTS_PANEL_PX = 800;
const COMMENTS_PANEL_STYLE: CSSProperties = {
  top: POPOVER_EDGE_PX, right: POPOVER_EDGE_PX, bottom: POPOVER_EDGE_PX,
  width: 'min(' + COMMENTS_PANEL_PX + 'px, calc(100vw - ' + 2 * POPOVER_EDGE_PX + 'px))',
};

export function CommentCell({ pr, now }: { pr: DerivedPullRequest; now: number }) {
  const { open, ref, toggle } = usePopover(COMMENTS_PANEL_PX);
  const all = useAllComments(pr, open);
  const latest = pr.latestComment;
  if (!pr.commentText || !latest) return <span className="dash">No comments</span>;
  // The latest comments from prs.json show at once; the full list replaces them when it arrives.
  const full = all.status === 'ready' && all.comments.length ? all.comments : null;
  const shown = full || pr.comments;
  const title = full ? plural(full.length, 'comment') : pr.comments.length > 1 ? 'Last ' + pr.comments.length + ' comments' : 'Last comment';
  return (
    <div className="comment-wrap" ref={ref}>
      <button type="button" className="comment-preview" aria-expanded={open} aria-label={'Comments on PR #' + pr.number} onClick={toggle}>
        <span className="comment-head">
          {latest.author ? <><Avatar actor={latest.author} small /><span>{displayLogin(latest.author)}</span></> : null}
          <span>· {formatAgo(latest.at, now)}</span>
          {pr.comments.length > 1 ? <span className="comment-more">+{pr.comments.length - 1}</span> : null}
        </span>
        <span className="comment-body">{markdownText(latest.body)}</span>
      </button>
      {open ? (
        <div className="popover comments-popover" role="dialog" aria-label={'Comments on PR #' + pr.number} style={COMMENTS_PANEL_STYLE}>
          <div className="panel-head">
            <strong className="popover-title">{title} · PR #{pr.number}</strong>
            <button type="button" className="btn icon-only" aria-label="Close" onClick={toggle}>×</button>
          </div>
          {all.status === 'loading' ? <p className="muted" role="status">Loading all comments…</p> : null}
          {all.status === 'error' ? <p className="muted" role="status">Showing the latest only. Cannot load the rest: {all.error}</p> : null}
          {shown.map((c, i) => (
            <article key={i} className="comment-full">
              <header>
                {c.author ? <><Avatar actor={c.author} small /><span className="who">{displayLogin(c.author)}</span></> : <span className="who">Unknown author</span>}
                <span className="when" title={new Date(c.at).toUTCString()}>{formatAgo(c.at, now)}</span>
                {c.url ? <a href={c.url} target="_blank" rel="noopener">Open on GitHub</a> : null}
              </header>
              {/* Sanitized by DOMPurify in renderMarkdown. */}
              <div className="comment-text markdown" dangerouslySetInnerHTML={{ __html: renderMarkdown(c.body) }} />
              {c.truncated ? <div className="comment-cut">The comment is longer; open it on GitHub to read the rest.</div> : null}
            </article>
          ))}
          {all.status === 'ready' && !all.complete ? <p className="muted">The list is longer than the board loads. Open the PR on GitHub for the rest.</p> : null}
          <a className="popover-footer" href={pr.url} target="_blank" rel="noopener">Open the conversation on GitHub</a>
        </div>
      ) : null}
    </div>
  );
}
