import { memo } from 'react';
import type { ReactNode } from 'react';
import type { Column } from '../../board/columns.ts';
import { formatAge, formatAgo, repositoryLabel } from '../../board/format.ts';
import { MERGE } from '../../board/states.ts';
import type { DerivedPullRequest } from '../../types.ts';
import { AttentionBadge } from '../cells/AttentionBadge.tsx';
import { CiCell } from '../cells/CiCell.tsx';
import { CommentCell } from '../cells/CommentCell.tsx';
import { ReviewCell } from '../cells/ReviewCell.tsx';
import { IssueLine } from '../common/IssueLine.tsx';
import { LabelList } from '../common/LabelList.tsx';
import { Person } from '../common/Person.tsx';
import { Pill } from '../common/Pill.tsx';

export const Row = memo(function Row({ pr, now, columns, repos, activeLabels, onToggleLabel }: {
  pr: DerivedPullRequest;
  now: number;
  columns: Column[];
  // Every repository on the board, so the Repository cell can leave out a shared owner.
  repos: string[];
  activeLabels: Set<string>;
  onToggleLabel: (name: string) => void;
}) {
  const cls = ['ci-' + pr.ci, pr.example ? 'example' : ''].join(' ').trim();
  const merge = MERGE[pr.mergeable];
  const link = (content: ReactNode) => <a href={pr.url} target="_blank" rel="noopener">{content}</a>;
  const cells: Record<string, ReactNode> = {
    repo: (
      <td key="repo" className="c-repo mono">
        {pr.repo ? <a href={'https://github.com/' + pr.repo} target="_blank" rel="noopener" title={pr.repo}>{repositoryLabel(pr.repo, repos)}</a>
          : <span className="dash">—</span>}
      </td>
    ),
    number: <td key="number" className="c-num mono num">{link('#' + pr.number)}</td>,
    title: (
      <td key="title" className="c-title">
        <div className="pr-title">{link(pr.title)}</div>
        {(pr.draft || pr.base !== 'main' || pr.example || pr.labels.length) ? (
          <div className="sub">
            {pr.example ? <span className="chip example">example</span> : null}
            {pr.draft ? <span className="chip draft">Draft</span> : null}
            {pr.base !== 'main' ? <span className="chip branch" title="Target branch">→ {pr.base}</span> : null}
            <LabelList labels={pr.labels} activeLabels={activeLabels} onToggle={onToggleLabel} />
          </div>
        ) : null}
        <IssueLine pr={pr} />
        {pr.note ? <div className="note">{pr.note}</div> : null}
      </td>
    ),
    author: <td key="author" className="c-person"><Person actor={pr.author} /></td>,
    ci: <td key="ci" className="c-state"><CiCell pr={pr} /></td>,
    review: <td key="review" className="c-state"><ReviewCell pr={pr} now={now} /></td>,
    merge: <td key="merge" className="c-state"><Pill state={merge} /></td>,
    age: (
      <td key="age" className="c-age">
        <div className={'age' + (pr.stale ? ' over' : '')}>{formatAge(pr.ageDays)}</div>
        <div className="activity" title={'Last updated ' + new Date(pr.updatedAt).toUTCString()}>updated {formatAgo(pr.updatedAt, now)}</div>
      </td>
    ),
    assignee: (
      <td key="assignee" className="c-person">
        {/* The index keeps keys unique when one person is listed twice. */}
        {pr.assignees.length ? pr.assignees.map((a, i) => <Person key={i + ':' + a.login} actor={a} />)
          : <span className="dash">Unassigned</span>}
      </td>
    ),
    comment: <td key="comment" className="c-comment"><CommentCell pr={pr} now={now} /></td>,
    attention: (
      <td key="attention" className="c-attn">
        {pr.attention.length ? <AttentionBadge reasons={pr.attention} number={pr.number} /> : null}
      </td>
    ),
  };
  return <tr className={cls}>{columns.map((col) => cells[col.id])}</tr>;
});
