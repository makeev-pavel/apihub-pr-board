// Settings that travel in the page address, so a link or a bookmark carries them: the repositories to show, the extra
// bot logins, and the hidden columns. They sit beside the view in the query, but Reset view leaves them alone.

import { isRepositoryName, MAX_REPOSITORIES, splitList, uniqueNames, sameName } from '../repository.ts';
import { COLUMNS } from './columns.ts';
import { parseList } from '../settings.ts';
import type { Settings } from '../settings.ts';

export const MAX_BOTS = 50;

// A GitHub login: letters, digits, and inner dashes, up to 39 characters; an app adds [bot].
const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?(?:\[bot\])?$/;

// Logins compare without case on GitHub, so a repeat in another case counts once.
export function cleanBots(logins: string[]): string[] {
  return uniqueNames(logins.filter((login) => LOGIN.test(login))).slice(0, MAX_BOTS);
}

export interface LinkSettings {
  // owner/name; empty shows every repository of the data.
  repos: string[];
  bots: string[];
  // Ids of the hidden columns; undefined when the address does not say, so the saved ones apply.
  hidden?: string[];
}

export function parseLinkSettings(search: string): LinkSettings {
  const params = new URLSearchParams(search);
  const repos = uniqueNames(splitList(params.get('repos') || '').filter(isRepositoryName)).slice(0, MAX_REPOSITORIES);
  const hide = params.get('hide');
  const hidden = hide === null ? undefined : uniqueNames(splitList(hide).filter((id) => COLUMNS.some((column) => column.id === id)));
  return { repos, bots: cleanBots(parseList(params.get('bots') || '')), hidden };
}

// Repository names are only letters, digits, and . _ - /, so they stay readable in the link; logins are encoded.
export function linkSettingsQuery(link: LinkSettings): string {
  const parts: string[] = [];
  if (link.repos.length) parts.push('repos=' + link.repos.join(','));
  if (link.bots.length) parts.push('bots=' + link.bots.map(encodeURIComponent).join(','));
  if (link.hidden && link.hidden.length) parts.push('hide=' + link.hidden.join(','));
  return parts.join('&');
}

export function readLinkSettings(): LinkSettings {
  return parseLinkSettings(window.location.search);
}

// The repositories the board shows, spelled as the data spells them, and the requested ones the data lacks.
export function boardRepos(dataRepos: string[], requested: string[]): { shown: string[]; missing: string[] } {
  if (!requested.length) return { shown: dataRepos, missing: [] };
  return {
    shown: dataRepos.filter((repo) => requested.some((r) => sameName(r, repo))),
    missing: requested.filter((repo) => !dataRepos.some((r) => sameName(r, repo))),
  };
}

// Extra bots used to be saved in this browser. They move into the address once, unless the link names its own.
export function moveStoredBots(settings: Settings, link: LinkSettings): { settings: Settings; link: LinkSettings; moved: boolean } {
  const stored = settings.rules.extraBots;
  if (!stored.length) return { settings, link, moved: false };
  return {
    settings: { ...settings, rules: { ...settings.rules, extraBots: [] } },
    link: link.bots.length ? link : { ...link, bots: stored },
    moved: true,
  };
}

const WHERE = { snapshot: 'not in the snapshot', live: 'not in the live data', none: 'not loaded yet' };

// The banner for requested repositories that the page has no data for; only Refresh can load them. 'none' is a page
// without a snapshot before its first load (DATA-23).
export function missingReposMessage(missing: string[], hasToken: boolean, source: keyof typeof WHERE): string {
  const one = missing.length === 1;
  const action = (hasToken ? 'Refresh' : 'Add a GitHub token in Settings, then Refresh') + ' loads ' + (one ? 'it' : 'them') + '.';
  return missing.join(', ') + (one ? ' is ' : ' are ') + WHERE[source] + '. ' + action;
}

// Hidden columns live in this browser and in the address (SET-8). A link that names them wins and is saved; otherwise
// the saved ones go into the address, so a copied link carries the same columns.
export function applyLinkColumns(settings: Settings, link: LinkSettings): { settings: Settings; link: LinkSettings; changed: boolean } {
  // A saved id no column has any more, such as one from an older version, stays out of the address.
  const known = settings.hiddenColumns.filter((id) => COLUMNS.some((column) => column.id === id));
  if (link.hidden === undefined) return { settings, link: { ...link, hidden: known }, changed: false };
  return { settings: { ...settings, hiddenColumns: link.hidden }, link, changed: true };
}
