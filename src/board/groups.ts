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

const within = (inner: RepoGroup, outer: RepoGroup) => {
  const outerRepos = lower(outer.repos);
  return inner.repos.every((repo) => outerRepos.includes(repo.toLowerCase()));
};
const checkedOthers = (group: RepoGroup, groups: RepoGroup[], repos: string[]) =>
  groups.filter((other) => other !== group && isGroupChecked(other, repos));

// The checked groups that hold all of this one and more. Equal groups are not wider than each other.
const widerGroups = (group: RepoGroup, groups: RepoGroup[], repos: string[]) =>
  checkedOthers(group, groups, repos).filter((other) => within(group, other) && !within(other, group));

// A checked group inside a wider checked group cannot be unchecked alone: the wider one keeps all its repositories.
// Returns why and what to do, for the tooltip, or null. Only the outermost groups are named, since the ones between
// are locked too.
export function groupLock(group: RepoGroup, groups: RepoGroup[], repos: string[]): string | null {
  if (!isGroupChecked(group, repos)) return null;
  const wider = widerGroups(group, groups, repos);
  if (!wider.length) return null;
  const outermost = wider.filter((other) => !widerGroups(other, groups, repos).length);
  const names = outermost.map((other) => other.name).join(', ');
  return 'Included in ' + names + '. Uncheck ' + names + ' to remove it.';
}

// Checking adds the group's repositories, unless that would pass the limit. Unchecking removes them, and the groups
// inside it, but keeps the repositories other checked groups share. When every repository is shared, they all go,
// so unchecking always unchecks; the groups that shared them lose theirs too.
export function toggleGroup(group: RepoGroup, groups: RepoGroup[], repos: string[]): string[] | { error: string } {
  if (!isGroupChecked(group, repos)) {
    const next = uniqueNames([...repos, ...group.repos]);
    if (next.length > MAX_REPOSITORIES) {
      return {
        error: 'Adding ' + group.name + ' would make ' + next.length + ' repositories; the board reads at most ' + MAX_REPOSITORIES
          + '. Uncheck a group first.',
      };
    }
    return next;
  }
  const own = lower(group.repos);
  const shared = lower(checkedOthers(group, groups, repos).filter((other) => !within(other, group)).flatMap((other) => other.repos));
  const next = repos.filter((repo) => !own.includes(repo.toLowerCase()) || shared.includes(repo.toLowerCase()));
  return next.length < repos.length ? next : repos.filter((repo) => !own.includes(repo.toLowerCase()));
}
