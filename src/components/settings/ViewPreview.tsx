import type { Density, ReviewColumn } from '../../settings.ts';
import { Octicon } from '../common/Octicon.tsx';
import type { OcticonName } from '../common/Octicon.tsx';

type Tone = 'good' | 'bad' | 'idle' | 'warn';

interface PreviewRow {
  ci: { code: string; tone: Tone };
  review: { code: string; tone: Tone };
  // Where each reviewer's review stands, for the Reviewers layout; "mine" is the viewer, whose review is due.
  reviewers: { icon: OcticonName; tone: Tone; mine?: boolean }[];
  title: string;
  avatar: string;
}

// Three made-up rows that show the states the wizard is about: passing and failing checks, approved, changes
// requested, and a review that waits for the viewer.
const ROWS: PreviewRow[] = [
  { ci: { code: 'P', tone: 'good' }, review: { code: '✓', tone: 'good' }, title: '78%', avatar: '#2da44e',
    reviewers: [{ icon: 'check', tone: 'good' }, { icon: 'check', tone: 'good' }] },
  { ci: { code: 'F', tone: 'bad' }, review: { code: 'CR', tone: 'bad' }, title: '62%', avatar: '#a475f9',
    reviewers: [{ icon: 'fileDiff', tone: 'bad' }, { icon: 'dot', tone: 'warn' }] },
  { ci: { code: 'P', tone: 'good' }, review: { code: '–', tone: 'idle' }, title: '70%', avatar: '#e16f24',
    reviewers: [{ icon: 'dot', tone: 'warn', mine: true }, { icon: 'dot', tone: 'warn' }] },
];

function Board({ theme, density, review }: { theme: 'light' | 'dark'; density: Density; review: ReviewColumn }) {
  return (
    <div className={'view-preview theme-' + theme + ' ' + density}>
      <div className="vp-head"><span className="vp-tile" /><span className="vp-tile" /><span className="vp-tile accent" /></div>
      {ROWS.map((row, index) => (
        <div key={index} className={'vp-row ci-' + row.ci.tone}>
          <span className="vp-avatar" style={{ background: row.avatar }} />
          <span className="vp-title"><span style={{ width: row.title }} /></span>
          <span className={'vp-pill ' + row.ci.tone}>{row.ci.code}</span>
          {review === 'code' ? <span className={'vp-pill ' + row.review.tone}>{row.review.code}</span> : (
            <span className="vp-reviewers">
              {row.reviewers.map((r, i) => (
                <span key={i} className={'vp-reviewer' + (r.mine ? ' mine' : '')}>
                  <span className="vp-mini-avatar" /><span className="vp-line" />
                  <span className={'vp-icon ' + r.tone}><Octicon name={r.icon} size={8} /></span>
                </span>
              ))}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// The Review cells alone, large enough to read, for the Review column step: a code per PR, or the reviewers with
// GitHub's icons. The made-up viewer is boris-k, whose own pending review stands out.
const REVIEW_CELLS: { code: string; tone: Tone; waiting: number; reviewers: { login: string; icon: OcticonName; tone: Tone; mine?: boolean }[] }[] = [
  { code: '✓', tone: 'good', waiting: 0, reviewers: [{ login: 'anna-dev', icon: 'check', tone: 'good' }, { login: 'chen-li', icon: 'check', tone: 'good' }] },
  { code: 'CR', tone: 'bad', waiting: 1, reviewers: [{ login: 'dara-ops', icon: 'fileDiff', tone: 'bad' }, { login: 'emil-qa', icon: 'dot', tone: 'warn' }] },
  { code: '–', tone: 'idle', waiting: 2, reviewers: [{ login: 'boris-k', icon: 'dot', tone: 'warn', mine: true }, { login: 'hana-docs', icon: 'dot', tone: 'warn' }] },
];

function ReviewCells({ theme, review }: { theme: 'light' | 'dark'; review: ReviewColumn }) {
  return (
    <div className={'view-preview cells theme-' + theme}>
      <div className="vp-cell-head">Review</div>
      {REVIEW_CELLS.map((cell, index) => (
        <div key={index} className="vp-cell">
          {review === 'code' ? (
            <span className="vp-code">
              <span className={'vp-pill big ' + cell.tone}>{cell.code}</span>
              {cell.waiting ? <span className="vp-waiting">◷{cell.waiting}</span> : null}
            </span>
          ) : (
            <span className="vp-people">
              {cell.reviewers.map((r) => (
                <span key={r.login} className={'vp-person' + (r.mine ? ' mine' : '')}>
                  <span className="vp-mini-avatar big" />
                  <span className="vp-login">{r.login}</span>
                  <span className={'vp-icon ' + r.tone}><Octicon name={r.icon} size={11} /></span>
                </span>
              ))}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// The Review cells in a given look; "split" draws them in light and dark side by side.
export function ReviewCellPreview({ theme, review }: { theme: 'light' | 'dark' | 'split'; review: ReviewColumn }) {
  if (theme !== 'split') return <div className="preview-frame" aria-hidden="true"><ReviewCells theme={theme} review={review} /></div>;
  return (
    <div className="preview-frame split" aria-hidden="true">
      <ReviewCells theme="light" review={review} />
      <ReviewCells theme="dark" review={review} />
    </div>
  );
}

// A small picture of the board in a given look, for the setup wizard (SET-21). It is decoration: the card's label says
// what it shows. "split" is the System theme: the light and the dark board side by side.
export function ViewPreview({ theme, density, review }: { theme: 'light' | 'dark' | 'split'; density: Density; review: ReviewColumn }) {
  if (theme !== 'split') return <div className="preview-frame" aria-hidden="true"><Board theme={theme} density={density} review={review} /></div>;
  return (
    <div className="preview-frame split" aria-hidden="true">
      <Board theme="light" density={density} review={review} />
      <Board theme="dark" density={density} review={review} />
    </div>
  );
}
