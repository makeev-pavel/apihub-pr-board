// The view (search, filters, quick filters, and sort), its URL query, and the rows it lets through.

import { AREAS } from '../model/areas.ts';
import { matchesQuery } from '../model/search.ts';
import type { ParsedQuery } from '../model/search.ts';
import type { AreaId, DerivedPullRequest } from '../types.ts';
import { CI, MERGE, REVIEW } from './states.ts';

interface QuickFilter {
  id: string;
  label: string;
  tone: string;
  test: (pr: DerivedPullRequest) => boolean;
}

export const QUICK: QuickFilter[] = [
  { id: 'ci', label: 'CI failing', tone: 'bad', test: (pr) => pr.ci === 'failing' },
  { id: 'review', label: 'Without approval', tone: 'warn', test: (pr) => pr.review !== 'approved' },
  { id: 'conflicts', label: 'Merge conflicts', tone: 'bad', test: (pr) => pr.mergeable === 'conflicts' },
  { id: 'attention', label: 'Need attention', tone: 'bad', test: (pr) => pr.attention.length > 0 },
];

export type SortKey = 'repo' | 'number' | 'title' | 'author' | 'ci' | 'review' | 'merge' | 'age' | 'attention';
type SortDir = 'asc' | 'desc';

const SORTS: Record<SortKey, (pr: DerivedPullRequest) => number | string> = {
  repo: (pr) => pr.repo.toLowerCase(),
  number: (pr) => pr.number,
  title: (pr) => pr.title.toLowerCase(),
  author: (pr) => pr.authorKey.toLowerCase(),
  ci: (pr) => CI[pr.ci].rank,
  review: (pr) => REVIEW[pr.review].rank,
  merge: (pr) => MERGE[pr.mergeable].rank,
  age: (pr) => -Date.parse(pr.createdAt),
  attention: (pr) => pr.attention.length,
};
const isSortKey = (value: string | null): value is SortKey => value !== null && value in SORTS;

// Text columns sort A to Z first; the others start with the highest value.
export function firstDirection(key: SortKey): SortDir {
  return key === 'repo' || key === 'title' || key === 'author' ? 'asc' : 'desc';
}

type AreaFilter = 'all' | 'other' | AreaId;
type DraftFilter = 'all' | 'ready' | 'draft';
export const AREA_OPTIONS: [AreaFilter, string][] = [['all', 'All'], ...AREAS.map((a): [AreaFilter, string] => [a.id, a.label]), ['other', 'Other']];
export const DRAFT_OPTIONS: [DraftFilter, string][] = [['all', 'All'], ['ready', 'Ready for review'], ['draft', 'Drafts']];

// Authors: null shows people (no bots), 'all' and 'bots' are presets, a list names the selected logins.
export type AuthorsFilter = null | 'all' | 'bots' | string[];

export interface View {
  q: string;
  authors: AuthorsFilter;
  draft: DraftFilter;
  area: AreaFilter;
  quick: string[];
  // Priority names from GitHub Projects, and 'none' for PRs without one (FILTER-16); empty shows every PR.
  priority: string[];
  sort: SortKey;
  dir: SortDir;
}

export const NO_PRIORITY = 'none';
const MAX_PRIORITIES = 20;

export const DEFAULT_VIEW: View = { q: '', authors: null, draft: 'ready', area: 'all', quick: [], priority: [], sort: 'attention', dir: 'desc' };

// The view a URL query describes; unknown or missing values fall back to the defaults.
export function parseView(search: string): View {
  const view = { ...DEFAULT_VIEW };
  const params = new URLSearchParams(search);
  const q = params.get('q');
  if (q !== null) view.q = q;
  const authors = params.get('authors');
  if (authors !== null) {
    view.authors = authors === 'all' || authors === 'bots' ? authors : authors.split(',').filter(Boolean);
  }
  const draft = DRAFT_OPTIONS.find(([id]) => id === params.get('draft'));
  if (draft) view.draft = draft[0];
  const area = AREA_OPTIONS.find(([id]) => id === params.get('area'));
  if (area) view.area = area[0];
  const quick = params.get('quick');
  if (quick !== null) {
    view.quick = quick.split(',').filter((id) => QUICK.some((f) => f.id === id));
  }
  const priority = params.get('priority');
  if (priority !== null) {
    const seen = new Set<string>();
    view.priority = priority.split(',').map((name) => name.trim()).filter((name) => {
      const key = name.toLowerCase();
      if (!name || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, MAX_PRIORITIES);
  }
  const sort = params.get('sort');
  if (isSortKey(sort)) view.sort = sort;
  const dir = params.get('dir');
  if (dir === 'asc' || dir === 'desc') view.dir = dir;
  return view;
}
// The URL query for a view, without the defaults, so the default view has a clean address.
export function viewQuery(view: View): string {
  const params = new URLSearchParams();
  if (view.q) params.set('q', view.q);
  if (view.authors) params.set('authors', typeof view.authors === 'string' ? view.authors : view.authors.join(','));
  if (view.draft !== DEFAULT_VIEW.draft) params.set('draft', view.draft);
  if (view.area !== DEFAULT_VIEW.area) params.set('area', view.area);
  if (view.quick.length) params.set('quick', view.quick.join(','));
  if (view.priority.length) params.set('priority', view.priority.join(','));
  if (view.sort !== DEFAULT_VIEW.sort || view.dir !== DEFAULT_VIEW.dir) {
    params.set('sort', view.sort);
    params.set('dir', view.dir);
  }
  return params.toString();
}

export function readView(): View {
  return parseView(window.location.search);
}

// extraQuery carries the link settings, which live beside the view in the address.
export function writeView(view: View, extraQuery = '') {
  const query = [viewQuery(view), extraQuery].filter(Boolean).join('&');
  // Safari throws after about 100 calls in 30 seconds, as fast typing in the search can make. The address then lags;
  // the page must not break.
  try {
    history.replaceState(null, '', window.location.pathname + (query ? '?' + query : '') + (window.location.hash || ''));
  } catch {
    // Kept in state; the next change writes the address again.
  }
}

// The priorities of a PR's linked issues, lowercased.
function prioritiesOf(pr: DerivedPullRequest): string[] {
  return pr.issues.filter((issue) => issue.priority).map((issue) => issue.priority!.name.toLowerCase());
}

export function matchesPriority(pr: DerivedPullRequest, selected: string[]): boolean {
  if (!selected.length) return true;
  const wanted = selected.map((name) => name.toLowerCase());
  const own = prioritiesOf(pr);
  return own.length ? own.some((name) => wanted.includes(name)) : wanted.includes(NO_PRIORITY);
}

// Every priority on the board with its number of PRs, in the order they first appear (FILTER-16).
export function collectPriorities(prs: DerivedPullRequest[]): { name: string; count: number }[] {
  const counts = new Map<string, { name: string; count: number }>();
  for (const pr of prs) {
    for (const name of new Set(pr.issues.filter((issue) => issue.priority).map((issue) => issue.priority!.name))) {
      const entry = counts.get(name.toLowerCase()) || { name, count: 0 };
      entry.count += 1;
      counts.set(name.toLowerCase(), entry);
    }
  }
  return [...counts.values()];
}

// The PRs the authors, draft status, area, priority, and search let through. Quick filters count against this list.
export function filterPullRequests(prs: DerivedPullRequest[], view: Pick<View, 'draft' | 'area'> & Partial<Pick<View, 'priority'>>,
  authors: Set<string>, query: ParsedQuery): DerivedPullRequest[] {
  return prs.filter((pr) => {
    if (!matchesPriority(pr, view.priority || [])) return false;
    if (!authors.has(pr.authorKey)) return false;
    if (view.draft === 'ready' && pr.draft) return false;
    if (view.draft === 'draft' && !pr.draft) return false;
    if (view.area === 'other' && pr.areas.length) return false;
    if (view.area !== 'all' && view.area !== 'other' && !pr.areas.includes(view.area)) return false;
    return matchesQuery(pr, query);
  });
}

// The rows of the table: the active quick filters on top, then the sort, newest PR first on ties.
export function visibleRows(prs: DerivedPullRequest[], view: Pick<View, 'quick' | 'sort' | 'dir'>): DerivedPullRequest[] {
  const tests = QUICK.filter((q) => view.quick.includes(q.id));
  const key = SORTS[view.sort];
  const sign = view.dir === 'asc' ? 1 : -1;
  return prs.filter((pr) => tests.every((q) => q.test(pr))).sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (ka < kb) return -sign;
    if (ka > kb) return sign;
    return b.number - a.number || a.repo.localeCompare(b.repo);
  });
}
