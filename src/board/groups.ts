// Repository groups (SET-19, FILTER-17): named lists of repositories defined in Settings. Checking a group in the
// Repositories menu fills the repos in the address, so a link never depends on the groups themselves.

import { checkRepositoryList, MAX_REPOSITORIES, uniqueNames } from '../repository.ts';

export interface RepoGroup {
  name: string;
  repos: string[];
}

export const MAX_GROUPS = 20;

// One group per line, "<name>: owner/name, owner/name". The first line that is wrong is named with the reason.
export function parseGroupLines(text: string): { groups: RepoGroup[] } | { error: string } {
  const groups: RepoGroup[] = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) continue;
    const where = 'Line ' + (i + 1) + ': ';
    const colon = line.indexOf(':');
    const name = colon > 0 ? line.slice(0, colon).trim() : '';
    if (!name) return { error: where + 'start with the group name and a colon, such as "Backend: acme/widgets".' };
    if (groups.some((group) => group.name.toLowerCase() === name.toLowerCase())) return { error: where + 'the group "' + name + '" is already defined.' };
    const list = checkRepositoryList(line.slice(colon + 1));
    if ('error' in list) return { error: where + list.error };
    if (!list.repos.length) return { error: where + 'the group "' + name + '" lists no repositories.' };
    groups.push({ name, repos: list.repos });
  }
  if (groups.length > MAX_GROUPS) return { error: 'Up to ' + MAX_GROUPS + ' groups; this list has ' + groups.length + '.' };
  return { groups };
}

export function groupsToText(groups: RepoGroup[]): string {
  return groups.map((group) => group.name + ': ' + group.repos.join(', ')).join('\n');
}

const lower = (names: string[]) => names.map((name) => name.toLowerCase());

// A group counts as checked when every one of its repositories is in the address.
export function isGroupChecked(group: RepoGroup, repos: string[]): boolean {
  const present = lower(repos);
  return group.repos.every((repo) => present.includes(repo.toLowerCase()));
}

const within = (inner: RepoGroup, outer: RepoGroup) => inner.repos.every((repo) => lower(outer.repos).includes(repo.toLowerCase()));

// The other checked groups that keep their own repositories when this one is unchecked: not the groups inside it,
// which go with it.
const keepers = (group: RepoGroup, groups: RepoGroup[], repos: string[]) =>
  groups.filter((other) => other !== group && !within(other, group) && isGroupChecked(other, repos));

// A checked group whose repositories wider checked groups all need cannot be unchecked alone: unchecking would change
// nothing. Returns why and what to do, for the tooltip, or null.
export function groupLock(group: RepoGroup, groups: RepoGroup[], repos: string[]): string | null {
  if (!isGroupChecked(group, repos)) return null;
  const others = keepers(group, groups, repos);
  const kept = lower(others.flatMap((other) => other.repos));
  if (!group.repos.every((repo) => kept.includes(repo.toLowerCase()))) return null;
  const names = others.filter((other) => lower(other.repos).some((repo) => lower(group.repos).includes(repo))).map((other) => other.name).join(', ');
  return 'Included in ' + names + '. Uncheck ' + names + ' to remove it.';
}

// Checking adds the group's repositories, unless that would pass the limit. Unchecking removes them, and the groups
// inside it, except the repositories a wider checked group still needs.
export function toggleGroup(group: RepoGroup, groups: RepoGroup[], repos: string[]): string[] | { error: string } {
  if (!isGroupChecked(group, repos)) {
    const next = uniqueNames([...repos, ...group.repos]);
    if (next.length > MAX_REPOSITORIES) {
      return { error: 'Adding ' + group.name + ' would make ' + next.length + ' repositories; the board reads at most ' + MAX_REPOSITORIES + '. Uncheck a group first.' };
    }
    return next;
  }
  const kept = lower(keepers(group, groups, repos).flatMap((other) => other.repos));
  return repos.filter((repo) => !lower(group.repos).includes(repo.toLowerCase()) || kept.includes(repo.toLowerCase()));
}
