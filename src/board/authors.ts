// The author menu: who opened the shown PRs and which of them are chosen.

import type { Actor, DerivedPullRequest } from '../types.ts';
import type { AuthorsFilter } from './view.ts';

export interface AuthorEntry {
  login: string;
  actor: Actor | null;
  bot: boolean;
  count: number;
}

export function collectAuthors(prs: DerivedPullRequest[]): AuthorEntry[] {
  const byLogin = new Map<string, AuthorEntry>();
  for (const pr of prs) {
    const entry = byLogin.get(pr.authorKey) || { login: pr.authorKey, actor: pr.author, bot: pr.bot, count: 0 };
    entry.count += 1;
    byLogin.set(pr.authorKey, entry);
  }
  return Array.from(byLogin.values()).sort((a, b) => a.login.localeCompare(b.login, 'en', { sensitivity: 'base' }));
}

export function selectedAuthors(mode: AuthorsFilter, authors: AuthorEntry[]): Set<string> {
  if (mode === 'all') return new Set(authors.map((a) => a.login));
  if (mode === 'bots') return new Set(authors.filter((a) => a.bot).map((a) => a.login));
  // A chosen login without open PRs in the current data is left out, so counts match what is shown.
  if (mode) return new Set(authors.map((a) => a.login).filter((login) => mode.includes(login)));
  return new Set(authors.filter((a) => !a.bot).map((a) => a.login));
}

// What the Authors button says about the choice.
export function authorsSummary(mode: AuthorsFilter, selected: Set<string>): string {
  if (mode === null) return 'People';
  if (mode === 'all') return 'Everyone';
  if (mode === 'bots') return 'Bots';
  if (selected.size === 0) return 'Nobody';
  if (selected.size === 1) return Array.from(selected)[0];
  return selected.size + ' selected';
}

// The choice after one author is checked or unchecked. A choice that equals a preset becomes that preset.
export function toggleAuthor(login: string, selected: Set<string>, authors: AuthorEntry[]): AuthorsFilter {
  const next = new Set(selected);
  if (next.has(login)) next.delete(login); else next.add(login);
  const people = authors.filter((a) => !a.bot).map((a) => a.login);
  const bots = authors.filter((a) => a.bot).map((a) => a.login);
  const everyone = authors.map((a) => a.login);
  const same = (list: string[]) => list.length === next.size && list.every((l) => next.has(l));
  if (same(people)) return null;
  if (same(everyone)) return 'all';
  if (bots.length && same(bots)) return 'bots';
  return everyone.filter((l) => next.has(l));
}
