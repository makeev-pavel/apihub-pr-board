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

// Checking adds the group's repositories; unchecking removes those no other checked group still needs.
export function toggleGroup(group: RepoGroup, groups: RepoGroup[], repos: string[]): string[] {
  if (!isGroupChecked(group, repos)) return uniqueNames([...repos, ...group.repos]).slice(0, MAX_REPOSITORIES);
  const kept = lower(groups.filter((other) => other !== group && isGroupChecked(other, repos)).flatMap((other) => other.repos));
  return repos.filter((repo) => !lower(group.repos).includes(repo.toLowerCase()) || kept.includes(repo.toLowerCase()));
}
