// Personal settings, kept in this browser's localStorage. Stored values are untrusted: anything missing or invalid
// falls back to the default, so an old or hand-edited entry never breaks the page.

import { MAX_GROUPS } from './board/groups.ts';
import type { RepoGroup } from './board/groups.ts';
import { AREAS } from './model/areas.ts';
import { isRepositoryName, uniqueNames } from './repository.ts';
import { DEFAULT_RULES } from './model/rules.ts';
import type { Rules } from './model/rules.ts';

export type Theme = 'system' | 'light' | 'dark';
export type Density = 'comfortable' | 'compact';

export interface Settings {
  rules: Rules;
  theme: Theme;
  density: Density;
  // Ids of columns the viewer turned off.
  hiddenColumns: string[];
  // Named lists of repositories for the Repositories menu (SET-19).
  repoGroups: RepoGroup[];
}

export const DEFAULT_SETTINGS: Settings = { rules: DEFAULT_RULES, theme: 'system', density: 'comfortable', hiddenColumns: [], repoGroups: [] };
export const MIN_STALE_DAYS = 1;
export const MAX_STALE_DAYS = 365;
export const THEMES: [Theme, string][] = [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']];
export const DENSITIES: [Density, string][] = [['comfortable', 'Comfortable'], ['compact', 'Compact']];

const SETTINGS_KEY = 'apihub-pr-board.settings';

export function isValidStaleDays(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= MIN_STALE_DAYS && (value as number) <= MAX_STALE_DAYS;
}

// Splits a comma- or space-separated list of logins or labels.
export function parseList(text: string): string[] {
  return Array.from(new Set(text.split(/[\s,]+/).filter(Boolean)));
}

function pick<T extends string>(value: unknown, options: [T, string][], fallback: T): T {
  const option = options.find(([id]) => id === value);
  return option ? option[0] : fallback;
}

function parseAreaModules(value: unknown): Rules['areaModules'] {
  const stored = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const modules = { ...DEFAULT_RULES.areaModules };
  for (const area of AREAS) {
    const list = stored[area.id];
    if (Array.isArray(list)) modules[area.id] = parseList(list.filter((m) => typeof m === 'string').join(' '));
  }
  return modules;
}

// Stored groups are checked like the field checks them; a broken group is dropped and the rest load.
function parseGroups(value: unknown): RepoGroup[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): RepoGroup[] => {
    const group = entry as Partial<RepoGroup> | null;
    if (!group || typeof group !== 'object' || typeof group.name !== 'string' || !group.name.trim() || !Array.isArray(group.repos)) return [];
    const repos = uniqueNames(group.repos.filter(isRepositoryName));
    return repos.length ? [{ name: group.name.trim(), repos }] : [];
  }).slice(0, MAX_GROUPS);
}

export function parseSettings(value: unknown): Settings {
  const stored = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const rules = (stored.rules && typeof stored.rules === 'object' ? stored.rules : {}) as Record<string, unknown>;
  return {
    rules: {
      staleDays: isValidStaleDays(rules.staleDays) ? rules.staleDays : DEFAULT_RULES.staleDays,
      checkTitle: typeof rules.checkTitle === 'boolean' ? rules.checkTitle : DEFAULT_RULES.checkTitle,
      requireIssue: typeof rules.requireIssue === 'boolean' ? rules.requireIssue : DEFAULT_RULES.requireIssue,
      extraBots: Array.isArray(rules.extraBots) ? parseList(rules.extraBots.filter((l) => typeof l === 'string').join(' ')) : DEFAULT_RULES.extraBots,
      areaModules: parseAreaModules(rules.areaModules),
    },
    theme: pick(stored.theme, THEMES, DEFAULT_SETTINGS.theme),
    density: pick(stored.density, DENSITIES, DEFAULT_SETTINGS.density),
    hiddenColumns: Array.isArray(stored.hiddenColumns) ? stored.hiddenColumns.filter((id) => typeof id === 'string') : [],
    repoGroups: parseGroups(stored.repoGroups),
  };
}

// The rules behind the Attention count (SET-10). The area lists only sort PRs into BE and FE, so they are left out.
export function rulesAreDefault(rules: Rules): boolean {
  const attention = ({ staleDays, checkTitle, requireIssue, extraBots }: Rules) => JSON.stringify([staleDays, checkTitle, requireIssue, extraBots]);
  return attention(rules) === attention(DEFAULT_RULES);
}

export function loadSettings(): Settings {
  try {
    return parseSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null'));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch { /* storage is blocked; settings live only for this page load */ }
}
