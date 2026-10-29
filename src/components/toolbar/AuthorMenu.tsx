import { authorsSummary, toggleAuthor } from '../../board/authors.ts';
import type { AuthorEntry } from '../../board/authors.ts';
import { displayLogin } from '../../board/format.ts';
import type { AuthorsFilter } from '../../board/view.ts';
import { GHOST_LOGIN } from '../../types.ts';
import { Avatar } from '../common/Avatar.tsx';
import { MenuButton } from '../common/MenuButton.tsx';

export function AuthorMenu({ authors, selected, mode, setAuthors }: {
  authors: AuthorEntry[];
  selected: Set<string>;
  mode: AuthorsFilter;
  setAuthors: (value: AuthorsFilter) => void;
}) {
  const summary = authorsSummary(mode, selected);
  const toggle = (login: string) => setAuthors(toggleAuthor(login, selected, authors, mode));
  const group = (title: string, list: AuthorEntry[]) => list.length ? (
    <>
      <div className="group">{title}</div>
      {list.map((a) => (
        <label key={a.login}>
          <input type="checkbox" checked={selected.has(a.login)} onChange={() => toggle(a.login)} />
          <Avatar actor={a.actor} small />
          <span>{a.actor ? displayLogin(a.actor) : GHOST_LOGIN}</span>
          <span className="n">{a.count}</span>
        </label>
      ))}
    </>
  ) : null;

  return (
    <MenuButton label="Authors" summary={summary}>
      {() => (
        <>
          <div className="actions">
            <button type="button" className="btn" onClick={() => setAuthors(null)}>People</button>
            <button type="button" className="btn" onClick={() => setAuthors('bots')}>Bots</button>
            <button type="button" className="btn" onClick={() => setAuthors('all')}>Everyone</button>
            <button type="button" className="btn" onClick={() => setAuthors([])}>Clear</button>
          </div>
          {group('People', authors.filter((a) => !a.bot))}
          {group('Bots', authors.filter((a) => a.bot))}
        </>
      )}
    </MenuButton>
  );
}
