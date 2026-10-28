import { useState } from 'react';
import { authorsSummary, toggleAuthor } from '../../board/authors.ts';
import type { AuthorEntry } from '../../board/authors.ts';
import { displayLogin } from '../../board/format.ts';
import type { AuthorsFilter } from '../../board/view.ts';
import { useDismiss } from '../../hooks/useDismiss.ts';
import { Avatar } from '../common/Avatar.tsx';

export function AuthorMenu({ authors, selected, mode, setAuthors }: {
  authors: AuthorEntry[];
  selected: Set<string>;
  mode: AuthorsFilter;
  setAuthors: (value: AuthorsFilter) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, setOpen);

  const summary = authorsSummary(mode, selected);
  const toggle = (login: string) => setAuthors(toggleAuthor(login, selected, authors));
  const group = (title: string, list: AuthorEntry[]) => list.length ? (
    <>
      <div className="group">{title}</div>
      {list.map((a) => (
        <label key={a.login}>
          <input type="checkbox" id={'author-' + a.login} checked={selected.has(a.login)} onChange={() => toggle(a.login)} />
          <Avatar actor={a.actor} small />
          <span>{a.actor ? displayLogin(a.actor) : 'ghost'}</span>
          <span className="n">{a.count}</span>
        </label>
      ))}
    </>
  ) : null;

  return (
    <div className="menu-wrap" ref={ref}>
      <button type="button" className="btn" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen(!open)}>
        Authors: <strong>{summary}</strong> <span className="arrow" aria-hidden="true">{open ? '▲' : '▼'}</span>
      </button>
      {open ? (
        <div className="menu" role="group" aria-label="Authors">
          <div className="actions">
            <button type="button" className="btn" onClick={() => setAuthors(null)}>People</button>
            <button type="button" className="btn" onClick={() => setAuthors('bots')}>Bots</button>
            <button type="button" className="btn" onClick={() => setAuthors('all')}>Everyone</button>
            <button type="button" className="btn" onClick={() => setAuthors([])}>Clear</button>
          </div>
          {group('People', authors.filter((a) => !a.bot))}
          {group('Bots', authors.filter((a) => a.bot))}
        </div>
      ) : null}
    </div>
  );
}
