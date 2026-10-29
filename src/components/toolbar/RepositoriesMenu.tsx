import { useState } from 'react';
import { groupColor, groupsSummary } from '../../board/groups.ts';
import type { RepoGroup } from '../../board/groups.ts';
import { useDismiss } from '../../hooks/useDismiss.ts';

// The Repositories menu (FILTER-17): a checkbox per group from Settings, and Ungrouped. It shows only the rows of the
// checked groups.
export function RepositoriesMenu({ groups, options, checked, counts, setChecked }: {
  groups: RepoGroup[];
  options: string[];
  checked: string[];
  counts: Map<string, number>;
  setChecked: (checked: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, setOpen);
  const toggle = (name: string) => setChecked(checked.includes(name) ? checked.filter((n) => n !== name) : [...checked, name]);
  const title = (name: string) => {
    const group = groups.find((g) => g.name === name);
    return group ? group.repos.join(', ') : 'Repositories in no group';
  };
  return (
    <div className="menu-wrap" ref={ref}>
      <button type="button" className="btn" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen(!open)}>
        Repositories: <strong>{groupsSummary(checked, options)}</strong> <span className="arrow" aria-hidden="true">{open ? '▲' : '▼'}</span>
      </button>
      {open ? (
        <div className="menu" role="group" aria-label="Repositories">
          <div className="actions">
            <button type="button" className="btn" onClick={() => setChecked(options)}>All</button>
            <button type="button" className="btn" onClick={() => setChecked([])}>None</button>
          </div>
          {options.map((name) => (
            <label key={name} title={title(name)} className={groupColor(groups, name) === null ? undefined : 'group-' + groupColor(groups, name)}>
              <input type="checkbox" checked={checked.includes(name)} onChange={() => toggle(name)} />
              <span>{name}</span>
              <span className="n">{counts.has(name) ? counts.get(name) : ''}</span>
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}
