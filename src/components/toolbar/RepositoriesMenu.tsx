import { useState } from 'react';
import { isGroupChecked, toggleGroup } from '../../board/groups.ts';
import type { RepoGroup } from '../../board/groups.ts';
import { useDismiss } from '../../hooks/useDismiss.ts';

// The Repositories menu (FILTER-17): a checkbox per group from Settings. It only edits the repos in the address.
export function RepositoriesMenu({ groups, repos, setRepos }: { groups: RepoGroup[]; repos: string[]; setRepos: (repos: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, setOpen);
  const checked = groups.filter((group) => isGroupChecked(group, repos));
  const summary = !repos.length ? 'All' : checked.length && checked.length <= 2 ? checked.map((group) => group.name).join(', ')
    : repos.length === 1 ? repos[0] : repos.length + ' repositories';
  return (
    <div className="menu-wrap" ref={ref}>
      <button type="button" className="btn" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen(!open)}>
        Repositories: <strong>{summary}</strong> <span className="arrow" aria-hidden="true">{open ? '▲' : '▼'}</span>
      </button>
      {open ? (
        <div className="menu" role="group" aria-label="Repositories">
          <div className="actions">
            <button type="button" className="btn" onClick={() => setRepos([])}>All repositories</button>
          </div>
          {groups.map((group) => (
            <label key={group.name} title={group.repos.join(', ')}>
              <input type="checkbox" checked={isGroupChecked(group, repos)} onChange={() => setRepos(toggleGroup(group, groups, repos))} />
              <span>{group.name}</span>
              <span className="n">{group.repos.length}</span>
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}
