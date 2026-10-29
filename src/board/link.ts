// Settings that travel in the page address, so a link or a bookmark carries them: the repositories to show and the
// extra bot logins. They sit beside the view in the query, but Reset view leaves them alone.

import { isRepositoryName, MAX_REPOSITORIES, splitList, uniqueNames } from '../repository.ts';
import { parseList } from '../settings.ts';
import type { Settings } from '../settings.ts';

export const MAX_BOTS = 50;

// A GitHub login: letters, digits, and inner dashes, up to 39 characters; an app adds [bot].
const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?(?:\[bot\])?$/;

export function cleanBots(logins: string[]): string[] {
  return logins.filter((login) => LOGIN.test(login)).slice(0, MAX_BOTS);
}

export interface LinkSettings {
  // owner/name; empty shows every repository of the data.
  repos: string[];
  bots: string[];
}

export function parseLinkSettings(search: string): LinkSettings {
  const params = new URLSearchParams(search);
  const repos = uniqueNames(splitList(params.get('repos') || '').filter(isRepositoryName)).slice(0, MAX_REPOSITORIES);
  return { repos, bots: cleanBots(parseList(params.get('bots') || '')) };
}

// Repository names are only letters, digits, and . _ - /, so they stay readable in the link; logins are encoded.
export function linkSettingsQuery(link: LinkSettings): string {
  const parts: string[] = [];
  if (link.repos.length) parts.push('repos=' + link.repos.join(','));
  if (link.bots.length) parts.push('bots=' + link.bots.map(encodeURIComponent).join(','));
  return parts.join('&');
}

export function readLinkSettings(): LinkSettings {
  return parseLinkSettings(window.location.search);
}

const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

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

// The banner for requested repositories that the data on the page does not cover; only Refresh can load them.
export function missingReposMessage(missing: string[], hasToken: boolean, live: boolean): string {
  const one = missing.length === 1;
  const action = (hasToken ? 'Refresh' : 'Add a GitHub token in Settings, then Refresh') + ' loads ' + (one ? 'it' : 'them') + '.';
  return missing.join(', ') + (one ? ' is' : ' are') + ' not in the ' + (live ? 'live data' : 'hourly snapshot') + '. ' + action;
}
