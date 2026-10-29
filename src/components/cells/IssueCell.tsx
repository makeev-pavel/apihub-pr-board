import type { PullRequest } from '../../types.ts';

// The Issue column (TABLE-8): the issues the PR closes (the Development field). Without one, the project it was added
// to instead, or "No issue".
export function IssueCell({ pr }: { pr: PullRequest }) {
  if (pr.issues.length) {
    return (
      <div className="issue-list">{pr.issues.map((issue, i) => (
        <a key={i} className="issue-ref" href={issue.url} target="_blank" rel="noopener"
          title={'Closes ' + issue.title + (issue.number ? ' (#' + issue.number + ')' : '')}>
          {issue.number ? <span className="issue-number">#{issue.number}</span> : null}
          <span className="issue-title">{issue.title}</span>
        </a>
      ))}</div>
    );
  }
  if (pr.projects && pr.projects.length) return <span className="dash">No issue · in {pr.projects.join(', ')}</span>;
  return <span className="dash">No issue</span>;
}
