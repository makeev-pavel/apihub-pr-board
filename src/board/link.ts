// Settings that travel in the page address, so a link or a bookmark carries them: the repositories to show, the extra
// bot logins, the hidden columns, and the repository groups. They sit beside the view in the query, but Reset view
// leaves them alone.

import { isRepositoryName, MAX_REPOSITORIES } from '../repository.ts';
import { parseList, splitList, uniqueNames } from '../names.ts';
import { COLUMNS } from './columns.ts';
import { groupsToText, parseGroupLines } from './groups.ts';
import type { RepoGroup } from './groups.ts';
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
  // The repository groups; undefined when the address does not name them, so the saved ones apply.
  groups?: RepoGroup[];
}

// Groups in the address: "*Name:owner/name,owner/name;Name:owner/name". Group names hold no ; or , (SET-19).
function parseLinkGroups(value: string): RepoGroup[] | undefined {
  const parsed = parseGroupLines(value.split(';').join('\n'));
  return 'groups' in parsed ? parsed.groups : undefined;
}

function linkGroupsValue(groups: RepoGroup[]): string {
  const keep = (text: string) => encodeURIComponent(text).replace(/%2F/g, '/').replace(/%2C/g, ',').replace(/%3A/g, ':').replace(/%2A/g, '*');
  return groups.map((group) => keep((group.isDefault ? '*' : '') + group.name + ':' + group.repos.join(','))).join(';');
}

export function parseLinkSettings(search: string): LinkSettings {
  const params = new URLSearchParams(search);
  const repos = uniqueNames(splitList(params.get('repos') || '').filter(isRepositoryName)).slice(0, MAX_REPOSITORIES);
  const hide = params.get('hide');
  const hiddenIds = hide === null ? [] : splitList(hide);
  const known = uniqueNames(hiddenIds.filter((id) => COLUMNS.some((column) => column.id === id)));
  // An empty hide= shows every column; a list of only unknown ids, such as one from a newer version, names nothing.
  const hidden = hide === null || (hiddenIds.length && !known.length) ? undefined : known;
  const groupsValue = params.get('repogroups');
  // An empty list names no groups, so the saved ones apply, as the address then shows.
  const groups = groupsValue ? parseLinkGroups(groupsValue) : undefined;
  return { repos, bots: cleanBots(parseList(params.get('bots') || '')), hidden, ...(groups ? { groups } : {}) };
}

// Repository names are only letters, digits, and . _ - /, so they stay readable in the link; logins are encoded.
export function linkSettingsQuery(link: LinkSettings): string {
  const parts: string[] = [];
  if (link.repos.length) parts.push('repos=' + link.repos.join(','));
  if (link.bots.length) parts.push('bots=' + link.bots.map(encodeURIComponent).join(','));
  if (link.hidden && link.hidden.length) parts.push('hide=' + link.hidden.join(','));
  if (link.groups && link.groups.length) parts.push('repogroups=' + linkGroupsValue(link.groups));
  return parts.join('&');
}

export function readLinkSettings(): LinkSettings {
  return parseLinkSettings(window.location.search);
}

// Extra bots used to be saved in this browser. They move into the address once, unless the link names its own.
export function moveStoredBots(settings: Settings, link: LinkSettings): { settings: Settings; link: LinkSettings; moved: boolean } {
  const stored = settings.rules.extraBots;
  if (!stored.length) return { settings, link, moved: false };
  return {
    settings: { ...settings, rules: { ...settings.rules, extraBots: [] } },
    link: link.bots.length ? link : { ...link, bots: cleanBots(stored) },
    moved: true,
  };
}

// Hidden columns live in this browser and in the address (SET-8). A link that names them wins and is saved; otherwise
// the saved ones go into the address, so a copied link carries the same columns.
export function applyLinkColumns(settings: Settings, link: LinkSettings): { settings: Settings; link: LinkSettings; changed: boolean } {
  if (link.hidden === undefined) return { settings, link: { ...link, hidden: settings.hiddenColumns }, changed: false };
  return { settings: { ...settings, hiddenColumns: link.hidden }, link, changed: true };
}

// Repository groups from a link show on this page without being saved, so opening a shared link never replaces the
// viewer's own groups. Without them, the saved groups go into the address, so a copied link carries them.
export function linkWithGroups(link: LinkSettings, saved: RepoGroup[]): LinkSettings {
  return link.groups === undefined ? { ...link, groups: saved } : link;
}

// The groups to save when Settings changes: the ones the viewer edited, or else the saved ones, never a link's.
export function groupsToSave(next: RepoGroup[], shown: RepoGroup[], saved: RepoGroup[]): RepoGroup[] {
  return groupsToText(next) === groupsToText(shown) ? saved : next;
}
