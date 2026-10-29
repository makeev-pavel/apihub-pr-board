import { useState } from 'react';
import { groupLock, isGroupChecked, toggleGroup } from '../../board/groups.ts';
import type { RepoGroup } from '../../board/groups.ts';
import { useDismiss } from '../../hooks/useDismiss.ts';

// The Repositories menu (FILTER-17): a checkbox per group from Settings. It only edits the repos in the address.
export function RepositoriesMenu({ groups, repos, setRepos }: { groups: RepoGroup[]; repos: string[]; setRepos: (repos: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useDismiss(open, setOpen);
  const checked = groups.filter((group) => isGroupChecked(group, repos));
  const inGroups = new Set(checked.flatMap((group) => group.repos.map((repo) => repo.toLowerCase())));
  const byHand = repos.filter((repo) => !inGroups.has(repo.toLowerCase())).length;
  const summary = !repos.length ? 'All'
    : checked.length && checked.length <= 2 ? checked.map((group) => group.name).join(', ') + (byHand ? ' +' + byHand : '')
      : repos.length === 1 ? repos[0] : repos.length + ' repositories';
  const toggle = (group: RepoGroup) => {
    const next = toggleGroup(group, groups, repos);
    if (Array.isArray(next)) {
      setError(null);
      setRepos(next);
    } else setError(next.error);
  };
  return (
    <div className="menu-wrap" ref={ref}>
      <button type="button" className="btn" aria-haspopup="true" aria-expanded={open} onClick={() => { setError(null); setOpen(!open); }}>
        Repositories: <strong>{summary}</strong> <span className="arrow" aria-hidden="true">{open ? '▲' : '▼'}</span>
      </button>
      {open ? (
        <div className="menu" role="group" aria-label="Repositories">
          <div className="actions">
            <button type="button" className="btn" onClick={() => { setError(null); setRepos([]); }}>All repositories</button>
          </div>
          {groups.map((group) => {
            const lock = groupLock(group, groups, repos);
            return (
              <label key={group.name} title={lock || group.repos.join(', ')}>
                <input type="checkbox" checked={isGroupChecked(group, repos)} disabled={!!lock} onChange={() => toggle(group)} />
                <span>{group.name}</span>
                <span className="n">{group.repos.length}</span>
              </label>
            );
          })}
          {error ? <p className="field-error" role="alert">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
