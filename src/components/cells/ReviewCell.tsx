import { displayLogin, formatAgo, plural } from '../../board/format.ts';
import { DECISION_BY_REVIEW, REVIEW, REVIEW_SECTIONS } from '../../board/states.ts';
import { usePopover } from '../../hooks/usePopover.ts';
import type { DerivedPullRequest, RequestedReviewer, Reviewer } from '../../types.ts';
import { Avatar } from '../common/Avatar.tsx';

const REVIEW_POPOVER_PX = 320;

// GitHub's own marks from Octicons (MIT): the dot of a pending review, and the arrows of a re-requested one.
const MY_REVIEW_ICON = {
  requested: 'M8 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z',
  again: 'M1.705 8.005a.75.75 0 0 1 .834.656 5.5 5.5 0 0 0 9.592 2.97l-1.204-1.204a.25.25 0 0 1 .177-.427h3.646a.25.25 0 0 1 .25.25v3.646a.25.25 0 0 1-.427.177l-1.38-1.38A7.002 7.002 0 0 1 1.05 8.84a.75.75 0 0 1 .656-.834ZM8 2.5a5.487 5.487 0 0 0-4.131 1.869l1.204 1.204A.25.25 0 0 1 4.896 6H1.25A.25.25 0 0 1 1 5.75V2.104a.25.25 0 0 1 .427-.177l1.38 1.38A7.002 7.002 0 0 1 14.95 7.16a.75.75 0 0 1-1.49.178A5.5 5.5 0 0 0 8 2.5Z',
};
const MY_REVIEW_TITLE = {
  requested: 'Your review is requested',
  again: 'Your review is requested again: you reviewed this PR before',
};

export function ReviewCell({ pr, now }: { pr: DerivedPullRequest; now: number }) {
  const { open, position, ref, toggle } = usePopover(REVIEW_POPOVER_PX);
  const state = REVIEW[pr.review];
  const waiting = pr.requestedReviewers;
  const approvers = pr.reviewers.filter((r) => r.state === 'APPROVED').map((r) => r.login);
  const decided = pr.reviewers.filter((r) => r.state === DECISION_BY_REVIEW[pr.review]).length;
  const accessibleName = state.label + (decided > 1 ? ' by ' + decided + ' reviewers' : '')
    + (waiting.length ? ', ' + plural(waiting.length, 'pending reviewer') : '') + ' on PR #' + pr.number + '. Show reviewers';
  const tooltip = [
    approvers.length ? 'Approved by ' + approvers.join(', ') : state.label,
    waiting.length ? 'Waiting for ' + waiting.map((r) => r.login).join(', ') : '',
  ].filter(Boolean).join('. ');
  // The index keeps keys unique for two deleted accounts (ghost) or a team and a user with the same name.
  const reviewer = (r: Reviewer | RequestedReviewer, index: number) => {
    const team = 'team' in r && r.team;
    const at = 'at' in r ? r.at : null;
    return (
      <li key={index + ':' + r.login}>
        <Avatar actor={r} small />
        <span className="who">{team ? '@' + r.login : displayLogin(r)}</span>
        {team ? <span className="chip">team</span> : null}
        {at ? <span className="when" title={new Date(at).toUTCString()}>{formatAgo(at, now)}</span> : null}
      </li>
    );
  };
  return (
    <div className="review-wrap" ref={ref}>
      <button type="button" className={'pill short ' + state.tone + ' as-button'} aria-expanded={open}
        aria-label={accessibleName} title={tooltip} onClick={toggle}>
        {state.short}{decided > 1 ? <sup>{decided}</sup> : null}
      </button>
      {waiting.length ? <span className="pending" aria-hidden="true" title={'Waiting for ' + plural(waiting.length, 'reviewer')}>◷{waiting.length}</span> : null}
      {pr.myReview ? (
        <span className={'mine ' + pr.myReview} role="img" aria-label={MY_REVIEW_TITLE[pr.myReview]} title={MY_REVIEW_TITLE[pr.myReview]}>
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d={MY_REVIEW_ICON[pr.myReview]} /></svg>
        </span>
      ) : null}
      {open ? (
        <div className="popover review-popover" role="dialog" aria-label={'Reviewers of PR #' + pr.number} style={position}>
          {REVIEW_SECTIONS.map(({ state: s, title }) => {
            const list = pr.reviewers.filter((r) => r.state === s);
            return list.length ? <section key={s}><strong className="popover-title">{title}</strong><ul className="people">{list.map(reviewer)}</ul></section> : null;
          })}
          {waiting.length ? <section><strong className="popover-title">Waiting for review from</strong><ul className="people">{waiting.map(reviewer)}</ul></section> : null}
          {!pr.reviewers.length && !waiting.length ? <p className="muted">No reviews yet, and nobody is requested as a reviewer.</p> : null}
          <a className="popover-footer" href={pr.url} target="_blank" rel="noopener">Open the PR on GitHub</a>
        </div>
      ) : null}
    </div>
  );
}
