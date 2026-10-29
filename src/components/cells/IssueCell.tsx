import { labelTextColor } from '../../board/format.ts';
import type { Issue, PullRequest } from '../../types.ts';

const VISIBLE_ISSUE_LABELS = 3;

// The Issue column (TABLE-8): the issues the PR closes (the Development field), each with its type and labels. Without
// one, the project it was added to instead, or "No issue".
export function IssueCell({ pr }: { pr: PullRequest }) {
  if (pr.issues.length) return <div className="issue-list">{pr.issues.map((issue, i) => <IssueItem key={i} issue={issue} />)}</div>;
  if (pr.projects && pr.projects.length) return <span className="dash">No issue · in {pr.projects.join(', ')}</span>;
  return <span className="dash">No issue</span>;
}

function IssueItem({ issue }: { issue: Issue }) {
  const shown = issue.labels.slice(0, VISIBLE_ISSUE_LABELS);
  const hidden = issue.labels.slice(VISIBLE_ISSUE_LABELS);
  return (
    <div className="issue-item">
      <a className="issue-ref" href={issue.url} target="_blank" rel="noopener"
        title={'Closes ' + issue.title + (issue.number ? ' (#' + issue.number + ')' : '')}>
        {issue.type ? (
          <span className="issue-type" title={'Issue type: ' + issue.type.name}>
            <span className="issue-type-dot" aria-hidden="true"
              style={{ background: 'var(--issue-type-' + (issue.type.color || 'gray') + ')' }}></span>
            {issue.type.name}
          </span>
        ) : null}
        {issue.number ? <span className="issue-number">#{issue.number}</span> : null}
        <span className="issue-title">{issue.title}</span>
      </a>
      {shown.length ? (
        <div className="issue-labels">
          {shown.map((label) => (
            <span key={label.name} className="label-chip static" title={label.description || label.name}
              style={label.color ? { background: '#' + label.color, color: labelTextColor(label.color) } : undefined}>{label.name}</span>
          ))}
          {hidden.length ? <span className="label-more static" title={hidden.map((l) => l.name).join(', ')}>+{hidden.length}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
