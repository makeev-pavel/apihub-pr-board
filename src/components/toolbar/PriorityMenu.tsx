import { useState } from 'react';
import { NO_PRIORITY } from '../../board/view.ts';
import { useDismiss } from '../../hooks/useDismiss.ts';

// The Priority filter (FILTER-16): the priorities of the linked issues, and No priority.
export function PriorityMenu({ priorities, noneCount, selected, setPriority }: {
  priorities: { name: string; count: number }[];
  noneCount: number;
  selected: string[];
  setPriority: (value: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, setOpen);
  const isOn = (name: string) => selected.some((s) => s.toLowerCase() === name.toLowerCase());
  const toggle = (name: string) => setPriority(isOn(name) ? selected.filter((s) => s.toLowerCase() !== name.toLowerCase()) : [...selected, name]);
  const label = (name: string) => (name === NO_PRIORITY ? 'No priority' : name);
  const summary = !selected.length ? 'All' : selected.length <= 2 ? selected.map(label).join(', ') : selected.length + ' selected';
  const options = [...priorities, { name: NO_PRIORITY, count: noneCount }];

  return (
    <div className="menu-wrap" ref={ref}>
      <button type="button" className="btn" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen(!open)}>
        Priority: <strong>{summary}</strong> <span className="arrow" aria-hidden="true">{open ? '▲' : '▼'}</span>
      </button>
      {open ? (
        <div className="menu" role="group" aria-label="Priority">
          <div className="actions">
            <button type="button" className="btn" onClick={() => setPriority([])}>All</button>
          </div>
          {options.map((option) => (
            <label key={option.name}>
              <input type="checkbox" checked={isOn(option.name)} onChange={() => toggle(option.name)} />
              <span>{label(option.name)}</span>
              <span className="n">{option.count}</span>
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}
