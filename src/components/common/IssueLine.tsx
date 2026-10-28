import type { PullRequest } from '../../types.ts';

// The issue the PR closes (the Development field). Without one, the project it was added to instead.
export function IssueLine({ pr }: { pr: PullRequest }) {
  if (pr.issues.length) {
    return (
      <div className="issue-line">{pr.issues.map((issue, i) => {
        const text = (
          <>
            <span className="issue-title">{issue.title}</span>
            {issue.number ? <span className="issue-number">(#{issue.number})</span> : null}
          </>
        );
        return (
          <span key={i} className="issue-ref" title={'Closes ' + issue.title + (issue.number ? ' (#' + issue.number + ')' : '')}>
            <span className="issue-icon" aria-hidden="true">↳</span>
            <a className="issue-text" href={issue.url} target="_blank" rel="noopener">{text}</a>
          </span>
        );
      })}</div>
    );
  }
  if (pr.projects && pr.projects.length) {
    return <div className="issue-line muted-line"><span className="issue-icon" aria-hidden="true">↳</span>No issue · in {pr.projects.join(', ')}</div>;
  }
  return null;
}
